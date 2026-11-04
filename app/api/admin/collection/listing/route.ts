import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { addCollectionQuotaUsage, checkCollectionQuota } from '@/lib/collection-quota';
import { fetchOperatorTagIdsByName } from '@/lib/operator-tags';
import { listPlaylist, unlistPlaylist, type ListingChangeResult } from '@/lib/listing-server';
import { estimateVideoFetchCost } from '@/lib/playlist-videos';
import { adminDb } from '@/lib/firebase-admin';
import { getQuotaConsumed, resetQuotaCounter } from '@/lib/youtube';

// 再生リストの掲載状態の切り替えAPI（管理者専用。収集候補レビューUI仕様書 §8.3・§8.6）。
//   { action: 'list', items: [{ playlistId, tagIds }] }           掲載する（動画一覧がまだなら YouTube から取る。最大20件）
//   { action: 'non_game' | 'excluded' | 'unconfirmed' | 'too_short', playlistIds }   掲載中でない状態にする（最大200件）
// チャンネル対象外（channel_off）の再生リストは、ここでは変えられない（掲載チャンネル画面で変える）。
const MAX_LIST_PER_REQUEST = 20;
const MAX_UNLIST_PER_REQUEST = 200;
const UNLIST_TARGETS = ['non_game', 'excluded', 'unconfirmed', 'too_short'] as const;

type Result = { playlistId: string; ok: boolean; error?: string };

function toResult(playlistId: string, r: ListingChangeResult): Result {
  return r.ok ? { playlistId, ok: true } : { playlistId, ok: false, error: r.error };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = (await request.json().catch(() => ({}))) as { action?: unknown; items?: unknown; playlistIds?: unknown };

  if (body.action === 'list') {
    const items = (Array.isArray(body.items) ? body.items : []).flatMap((v): Array<{ playlistId: string; tagIds: string[] }> => {
      if (!v || typeof v !== 'object') return [];
      const { playlistId, tagIds } = v as Record<string, unknown>;
      if (typeof playlistId !== 'string' || !/^[\w-]+$/.test(playlistId)) return [];
      return [{ playlistId, tagIds: Array.isArray(tagIds) ? tagIds.filter((t): t is string => typeof t === 'string') : [] }];
    });
    if (items.length === 0 || items.length > MAX_LIST_PER_REQUEST) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

    const snaps = await adminDb.getAll(...items.map((i) => adminDb.collection('playlists').doc(i.playlistId)));
    const estimated = snaps.reduce((sum, s) => sum + (s.exists && s.data()!.youtubeItemCount == null ? estimateVideoFetchCost((s.data()!.videoCount as number) ?? 0) : 0), 0);
    const quota = await checkCollectionQuota(estimated);
    if (!quota.ok) return NextResponse.json({ error: 'quota_exceeded', remaining: quota.remaining }, { status: 429 });

    const operatorTagIds = new Set((await fetchOperatorTagIdsByName()).values());
    resetQuotaCounter();
    const results: Result[] = [];
    try {
      for (const item of items) {
        const tagIds = [...new Set(item.tagIds)].filter((t) => operatorTagIds.has(t));
        results.push(toResult(item.playlistId, await listPlaylist(item.playlistId, { setBy: 'admin', reason: 'admin', tagIds })));
      }
    } finally {
      await addCollectionQuotaUsage(getQuotaConsumed());
    }
    return NextResponse.json({ results });
  }

  const target = UNLIST_TARGETS.find((t) => t === body.action);
  if (target) {
    const ids = Array.isArray(body.playlistIds) ? [...new Set(body.playlistIds.filter((v): v is string => typeof v === 'string' && /^[\w-]+$/.test(v)))] : [];
    if (ids.length === 0 || ids.length > MAX_UNLIST_PER_REQUEST) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    const results: Result[] = [];
    for (const id of ids) results.push(toResult(id, await unlistPlaylist(id, target, { setBy: 'admin', reason: 'admin' })));
    return NextResponse.json({ results });
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
