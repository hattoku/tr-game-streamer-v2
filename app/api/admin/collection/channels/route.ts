import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { addCollectionQuotaUsage, checkCollectionQuota } from '@/lib/collection-quota';
import { NAME_SEARCH_COST } from '@/lib/collection-quota-shared';
import { exploreChannels } from '@/lib/exploration-server';
import { fetchOperatorTagIdsByName } from '@/lib/operator-tags';
import { restoreChannelPlaylists, turnChannelOff } from '@/lib/listing-server';
import {
  getQuotaConsumed,
  parseChannelRef,
  resetQuotaCounter,
  resolveChannelRef,
  searchChannelsByName,
  YouTubeApiError,
  type ChannelDetail,
} from '@/lib/youtube';

// 掲載チャンネル（探索対象チャンネル）の管理API（管理者専用。管理_Ai運営者 コンテンツ収集機能仕様書 v3.0 §3.1、
// 収集候補レビューUI仕様書 v2.0 §6）。exploration_channels への書き込みはこのAPIからのみ行う（rules で write 不可）。
// action:
//   add           { lines }            1行1件。URL・@ハンドル・UC...は即特定して active、それ以外は名前として unresolved
//   resolve_names { limit?, id? }      unresolved を名前で検索し候補を付けて pending_confirm に（約101ユニット/件）
//   confirm       { id, youtubeChannelId }  候補から確定して active に
//   set_ref       { id, ref }          URL・ハンドルで直接特定して active に（1ユニット）
//   exclude       { id, note? }        掲載から外す（active なら再生リストをすべて非表示にする。収集候補レビューUI仕様書 §9.3）
//   relist        { id }               掲載しない（excluded）を掲載する。再生リストは元の掲載状態に戻る
//   opt_out       { id, note?, inquiryId? }  実況者・事務所の申し出で掲載を止める。すぐ再生リストをすべて非表示にする
//   resume        { id }               掲載停止（opted_out）を解いて掲載を再開する
//   restore       { id }               確認待ちを未特定に戻す
//   set_tags      { id, tagIds }       チャンネル単位タグ（運営者タグのみ）
//   set_mode      { id, publishMode }  掲載方法（confirm／auto）
//   set_order     { id, featuredOrder } 「人気のチャンネル」・チャンネル一覧の人気順のピン留め（小さいほど先。null で外す。段階5）
// チャンネルを登録済み（active）にしたときは、そのチャンネルをその場で1回巡回する（コンテンツ収集機能仕様書 §10.3）。
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
  note?: unknown;
  inquiryId?: unknown;
  publishMode?: unknown;
  featuredOrder?: unknown;
};

/** その場の巡回の上限（まとめて追加したときは残りを毎日の巡回に任せる） */
const MAX_SWEEP_ON_ADD = 5;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function activeFields(detail: ChannelDetail, now: Date, existing: Record<string, unknown> = {}) {
  return {
    status: 'active',
    publishMode: existing.publishMode === 'auto' ? 'auto' : 'confirm',
    authorizedVia: (existing.authorizedVia as string | undefined) ?? 'admin',
    authorizedAt: now,
    youtubeChannelId: detail.youtubeChannelId,
    channelTitle: detail.title,
    channelIconUrl: detail.iconUrl,
    subscriberCount: detail.subscriberCount,
    searchCandidates: [],
    updatedAt: now,
  };
}

/** 同じYouTubeチャンネルが別ドキュメントで既に active（または掲載停止）なら、そのドキュメントIDを返す */
async function findActiveDuplicate(youtubeChannelId: string, selfId?: string): Promise<string | null> {
  const snap = await adminDb.collection('exploration_channels').where('youtubeChannelId', '==', youtubeChannelId).get();
  const dup = snap.docs.find((d) => d.id !== selfId && (d.data().status === 'active' || d.data().status === 'opted_out'));
  return dup?.id ?? null;
}

/** 登録済みにした直後の巡回。失敗しても登録は成功として扱う（毎日の巡回が拾う）。収集の枠の使用量は exploreChannels が記録する */
async function sweepNow(explorationChannelId: string, uid: string): Promise<{ newPlaylists: number } | null> {
  try {
    const quota = await checkCollectionQuota(1);
    if (!quota.ok) return null;
    const summary = await exploreChannels({ trigger: 'manual', executedBy: uid, explorationChannelId });
    return { newPlaylists: summary.candidatesFound };
  } catch (e) {
    console.error('掲載チャンネルのその場の巡回に失敗', explorationChannelId, e);
    return null;
  }
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
    const toSweep: string[] = [];
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
        const added = await collection.add({
          name: detail.title,
          ...activeFields(detail, now),
          tagIds: [],
          lastExploredAt: null,
          lastFoundCount: null,
          createdAt: now,
          createdBy: auth.uid,
        });
        toSweep.push(added.id);
        addedActive++;
      }
    } finally {
      await addCollectionQuotaUsage(getQuotaConsumed());
    }
    let swept = 0;
    for (const id of toSweep.slice(0, MAX_SWEEP_ON_ADD)) {
      if (await sweepNow(id, auth.uid)) swept++;
    }
    return NextResponse.json({ addedActive, addedNames, duplicates, notFound, swept });
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
    await ref.update(activeFields(candidate, now, data));
    return NextResponse.json({ ok: true, sweep: await sweepNow(id, auth.uid) });
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
    await ref.update(activeFields(detail, now, data));
    return NextResponse.json({ ok: true, sweep: await sweepNow(id, auth.uid) });
  }

  const note = str(body.note)?.slice(0, 500) ?? null;
  const youtubeChannelId = (data.youtubeChannelId as string | null | undefined) ?? null;

  if (action === 'exclude') {
    // 掲載停止のチャンネルは、本人の申し出で止めたもの。掲載しないに化けさせない（再開は resume だけ）
    if (data.status === 'opted_out' || data.status === 'excluded') return NextResponse.json({ error: 'invalid_status' }, { status: 409 });
    // 掲載チャンネルを外すと、再生リストはすべて非表示（channel_off）になる。消さない（§10.6）
    const turnedOff = data.status === 'active' ? await turnChannelOff(id, youtubeChannelId, 'channel_excluded') : 0;
    await ref.update({ status: 'excluded', ...(note ? { statusNote: note } : {}), updatedAt: now });
    return NextResponse.json({ ok: true, turnedOff });
  }

  if (action === 'opt_out') {
    if (data.status !== 'active' && data.status !== 'excluded') return NextResponse.json({ error: 'invalid_status' }, { status: 409 });
    const inquiryId = str(body.inquiryId);
    const statusNote = [inquiryId ? `お問い合わせ: ${inquiryId}` : null, note].filter(Boolean).join(' ／ ') || null;
    // 申し出を受けたら、まず再生リストを非表示にする（状態の更新より先）
    const turnedOff = await turnChannelOff(id, youtubeChannelId, 'opt_out');
    await ref.update({ status: 'opted_out', optedOutAt: now, statusNote, updatedAt: now });
    return NextResponse.json({ ok: true, turnedOff });
  }

  if (action === 'relist' || action === 'resume') {
    const from = action === 'relist' ? 'excluded' : 'opted_out';
    if (data.status !== from) return NextResponse.json({ error: 'invalid_status' }, { status: 409 });
    if (!youtubeChannelId) return NextResponse.json({ error: 'channel_not_resolved' }, { status: 409 });
    if (await findActiveDuplicate(youtubeChannelId, id)) return NextResponse.json({ error: 'duplicate_channel' }, { status: 409 });
    await ref.update({
      status: 'active',
      publishMode: data.publishMode === 'auto' ? 'auto' : 'confirm',
      authorizedAt: now,
      optedOutAt: null,
      updatedAt: now,
    });
    const restored = await restoreChannelPlaylists(id, youtubeChannelId);
    return NextResponse.json({ ok: true, ...restored, sweep: await sweepNow(id, auth.uid) });
  }

  if (action === 'set_mode') {
    if (body.publishMode !== 'confirm' && body.publishMode !== 'auto') return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    await ref.update({ publishMode: body.publishMode, updatedAt: now });
    return NextResponse.json({ ok: true });
  }

  if (action === 'set_order') {
    const order = body.featuredOrder;
    if (order !== null && !(typeof order === 'number' && Number.isFinite(order))) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    await ref.update({ featuredOrder: order, updatedAt: now });
    return NextResponse.json({ ok: true });
  }

  if (action === 'restore') {
    if (data.status === 'active' || data.status === 'opted_out') return NextResponse.json({ error: 'invalid_status' }, { status: 409 });
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
