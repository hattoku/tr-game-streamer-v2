import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { addCollectionQuotaUsage, checkCollectionQuota } from '@/lib/collection-quota';
import { NAME_SEARCH_COST } from '@/lib/collection-quota-shared';
import { fetchOperatorTagIdsByName } from '@/lib/exploration-server';
import {
  getQuotaConsumed,
  parseChannelRef,
  resetQuotaCounter,
  resolveChannelRef,
  searchChannelsByName,
  YouTubeApiError,
  type ChannelDetail,
} from '@/lib/youtube';

// 探索対象チャンネルの管理API（管理者専用。管理_Ai運営者 コンテンツ収集機能仕様書 v3.0 §3.1、
// 収集候補レビューUI仕様書 v2.0 §6）。exploration_channels への書き込みはこのAPIからのみ行う（rules で write 不可）。
// action:
//   add           { lines }            1行1件。URL・@ハンドル・UC...は即特定して active、それ以外は名前として unresolved
//   resolve_names { limit?, id? }      unresolved を名前で検索し候補を付けて pending_confirm に（約101ユニット/件）
//   confirm       { id, youtubeChannelId }  候補から確定して active に
//   set_ref       { id, ref }          URL・ハンドルで直接特定して active に（1ユニット）
//   exclude       { id }               除外（探索しない）
//   restore       { id }               除外・確認待ちを未特定に戻す
//   set_tags      { id, tagIds }       チャンネル単位タグ（運営者タグのみ）
const MAX_RESOLVE_PER_REQUEST = 40;
const MAX_LINES_PER_REQUEST = 200;

type Body = {
  action?: unknown;
  id?: unknown;
  lines?: unknown;
  limit?: unknown;
  youtubeChannelId?: unknown;
  ref?: unknown;
  tagIds?: unknown;
};

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function activeFields(detail: ChannelDetail, now: Date) {
  return {
    status: 'active',
    youtubeChannelId: detail.youtubeChannelId,
    channelTitle: detail.title,
    channelIconUrl: detail.iconUrl,
    subscriberCount: detail.subscriberCount,
    searchCandidates: [],
    updatedAt: now,
  };
}

/** 同じYouTubeチャンネルが別ドキュメントで既に active なら、そのドキュメントIDを返す */
async function findActiveDuplicate(youtubeChannelId: string, selfId?: string): Promise<string | null> {
  const snap = await adminDb.collection('exploration_channels').where('youtubeChannelId', '==', youtubeChannelId).get();
  const dup = snap.docs.find((d) => d.id !== selfId && d.data().status === 'active');
  return dup?.id ?? null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = (await request.json()) as Body;
  const action = str(body.action);
  const now = new Date();
  const collection = adminDb.collection('exploration_channels');

  if (action === 'add') {
    const lines = typeof body.lines === 'string'
      ? [...new Set(body.lines.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))]
      : [];
    if (lines.length === 0) return NextResponse.json({ error: 'empty' }, { status: 400 });
    if (lines.length > MAX_LINES_PER_REQUEST) return NextResponse.json({ error: 'too_many_lines' }, { status: 400 });

    const refLines = lines.filter((l) => parseChannelRef(l));
    const quota = await checkCollectionQuota(refLines.length);
    if (!quota.ok) return NextResponse.json({ error: 'quota_exceeded', remaining: quota.remaining }, { status: 429 });

    const existingNames = new Set((await collection.select('name').get()).docs.map((d) => d.data().name as string));
    resetQuotaCounter();
    let addedActive = 0;
    let addedNames = 0;
    let duplicates = 0;
    const notFound: string[] = [];

    try {
      for (const line of lines) {
        const ref = parseChannelRef(line);
        if (!ref) {
          if (existingNames.has(line)) {
            duplicates++;
            continue;
          }
          await collection.add({
            name: line,
            status: 'unresolved',
            youtubeChannelId: null,
            channelTitle: null,
            channelIconUrl: null,
            subscriberCount: null,
            searchCandidates: [],
            tagIds: [],
            lastExploredAt: null,
            lastFoundCount: null,
            createdAt: now,
            createdBy: auth.uid,
            updatedAt: now,
          });
          existingNames.add(line);
          addedNames++;
          continue;
        }
        const detail = await resolveChannelRef(ref);
        if (!detail) {
          notFound.push(line);
          continue;
        }
        if (await findActiveDuplicate(detail.youtubeChannelId)) {
          duplicates++;
          continue;
        }
        await collection.add({
          name: detail.title,
          ...activeFields(detail, now),
          tagIds: [],
          lastExploredAt: null,
          lastFoundCount: null,
          createdAt: now,
          createdBy: auth.uid,
        });
        addedActive++;
      }
    } finally {
      await addCollectionQuotaUsage(getQuotaConsumed());
    }
    return NextResponse.json({ addedActive, addedNames, duplicates, notFound });
  }

  if (action === 'resolve_names') {
    const id = str(body.id);
    const limit = Math.min(
      MAX_RESOLVE_PER_REQUEST,
      typeof body.limit === 'number' && body.limit > 0 ? Math.floor(body.limit) : MAX_RESOLVE_PER_REQUEST,
    );
    const targets = id
      ? [await collection.doc(id).get()].filter((d) => d.exists && d.data()!.status === 'unresolved')
      : (await collection.where('status', '==', 'unresolved').get()).docs
          .sort((a, b) => (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0))
          .slice(0, limit);
    if (targets.length === 0) return NextResponse.json({ resolved: 0, noResult: 0 });

    const quota = await checkCollectionQuota(targets.length * NAME_SEARCH_COST);
    if (!quota.ok) {
      return NextResponse.json(
        { error: 'quota_exceeded', remaining: quota.remaining, maxCount: Math.floor(quota.remaining / NAME_SEARCH_COST) },
        { status: 429 },
      );
    }

    resetQuotaCounter();
    let resolved = 0;
    let noResult = 0;
    const errors: string[] = [];
    try {
      for (const doc of targets) {
        try {
          const candidates = await searchChannelsByName(doc.data()!.name as string);
          await doc.ref.update({ status: 'pending_confirm', searchCandidates: candidates, updatedAt: new Date() });
          if (candidates.length === 0) noResult++;
          else resolved++;
        } catch (e) {
          errors.push(e instanceof YouTubeApiError ? e.message : 'youtube_api_error');
          // クォータ切れ等は以降も失敗するので打ち切る
          break;
        }
      }
    } finally {
      await addCollectionQuotaUsage(getQuotaConsumed());
    }
    return NextResponse.json({ resolved, noResult, errors });
  }

  const id = str(body.id);
  if (!id) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const ref = collection.doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const data = snap.data()!;

  if (action === 'confirm') {
    const youtubeChannelId = str(body.youtubeChannelId);
    const candidate = (data.searchCandidates as ChannelDetail[] | undefined)?.find((c) => c.youtubeChannelId === youtubeChannelId);
    if (!candidate) return NextResponse.json({ error: 'candidate_not_found' }, { status: 400 });
    if (await findActiveDuplicate(candidate.youtubeChannelId, id)) {
      return NextResponse.json({ error: 'duplicate_channel' }, { status: 409 });
    }
    await ref.update(activeFields(candidate, now));
    return NextResponse.json({ ok: true });
  }

  if (action === 'set_ref') {
    const input = str(body.ref);
    const channelRef = input ? parseChannelRef(input) : null;
    if (!channelRef) return NextResponse.json({ error: 'invalid_ref' }, { status: 400 });
    const quota = await checkCollectionQuota(1);
    if (!quota.ok) return NextResponse.json({ error: 'quota_exceeded', remaining: quota.remaining }, { status: 429 });
    resetQuotaCounter();
    let detail: ChannelDetail | null;
    try {
      detail = await resolveChannelRef(channelRef);
    } catch (e) {
      return NextResponse.json({ error: 'youtube_api_error', message: e instanceof YouTubeApiError ? e.message : undefined }, { status: 502 });
    } finally {
      await addCollectionQuotaUsage(getQuotaConsumed());
    }
    if (!detail) return NextResponse.json({ error: 'channel_not_found' }, { status: 404 });
    if (await findActiveDuplicate(detail.youtubeChannelId, id)) {
      return NextResponse.json({ error: 'duplicate_channel' }, { status: 409 });
    }
    await ref.update(activeFields(detail, now));
    return NextResponse.json({ ok: true });
  }

  if (action === 'exclude') {
    await ref.update({ status: 'excluded', updatedAt: now });
    return NextResponse.json({ ok: true });
  }

  if (action === 'restore') {
    await ref.update({ status: 'unresolved', youtubeChannelId: null, channelTitle: null, channelIconUrl: null, subscriberCount: null, updatedAt: now });
    return NextResponse.json({ ok: true });
  }

  if (action === 'set_tags') {
    const requested = Array.isArray(body.tagIds) ? body.tagIds.filter((t): t is string => typeof t === 'string') : [];
    const operatorTagIds = new Set((await fetchOperatorTagIdsByName()).values());
    const tagIds = [...new Set(requested)].filter((t) => operatorTagIds.has(t));
    await ref.update({ tagIds, updatedAt: now });
    return NextResponse.json({ tagIds });
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
