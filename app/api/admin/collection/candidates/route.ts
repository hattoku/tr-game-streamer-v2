import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { addCollectionQuotaUsage, checkCollectionQuota } from '@/lib/collection-quota';
import { fetchOperatorTagIdsByName } from '@/lib/exploration-server';
import {
  createCollectionGameResolver,
  MAX_GAME_TITLE_LENGTH,
  searchRakutenForGameTitle,
  type CollectionGameResolver,
  type RakutenChoice,
} from '@/lib/collection-game';
import { RakutenApiError } from '@/lib/rakuten';
import { normalizeForMatch } from '@/lib/exploration-rules';
import { registerPlaylist } from '@/lib/playlist-registration';
import { fetchPlaylistItems, fetchVideoDurations, getQuotaConsumed, resetQuotaCounter, YouTubeApiError } from '@/lib/youtube';

// 収集候補の承認・却下API（管理者専用。管理 AI運営者向け収集候補レビューUI仕様書 v2.2 §3.7・§4・§5）。
// action:
//   approve { items: [{ playlistId, gameId?, newGameTitle?, rakutenJan?, tagIds }] }  まとめて登録（最大50件、1件ずつ順に処理）
//           gameId が無い候補は newGameTitle のゲームを使う（既存に一致すればそれ、無ければ新規登録。§4.3）
//           rakutenJan は新規登録するゲームに結び付ける楽天ブックスの商品（null は楽天なし、省略は完全一致で探す）
//   videos { playlistId }                                再生リストの全動画（タイトル・長さ・公開日）を取得（承認前の確認用。§3.8）
//   rakuten_search { playlistId, title, query? }         新規のゲーム名（query があればその語）で楽天ブックスを検索し、結果を候補に保存（§3.7）
//   reject  { playlistIds }                              却下
//   restore { playlistIds }                              却下済みを未処理に戻す
// 登録処理は管理者用の再生リスト登録と共用（lib/playlist-registration.ts）。タグは運営者タグのみを固定タグとして付ける。
const MAX_APPROVE_PER_REQUEST = 50;
const MAX_STATUS_CHANGE_PER_REQUEST = 500;

type ApproveItem = { playlistId: string; gameId: string | null; newGameTitle: string | null; rakutenJan: RakutenChoice; tagIds: string[] };

type ApproveResult = { playlistId: string; ok: boolean; error?: string; createdGame?: { id: string; title: string } };

function parseApproveItems(value: unknown): ApproveItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (!v || typeof v !== 'object') return [];
    const { playlistId, gameId, newGameTitle, rakutenJan, tagIds } = v as Record<string, unknown>;
    if (typeof playlistId !== 'string' || !playlistId) return [];
    const id = typeof gameId === 'string' && gameId ? gameId : null;
    const title = typeof newGameTitle === 'string' && newGameTitle.trim() ? newGameTitle.trim() : null;
    // ゲームはIDか、照合・新規登録に使える名前のどちらかが必須
    if (!id && (!title || title.length > MAX_GAME_TITLE_LENGTH || !normalizeForMatch(title))) return [];
    return [{
      playlistId,
      gameId: id,
      newGameTitle: id ? null : title,
      // 省略は完全一致で探す。JAN として読めない値は、指定した商品と違うものを入れないよう楽天なしとして扱う
      rakutenJan: rakutenJan === undefined ? undefined : typeof rakutenJan === 'string' && /^\d{8,14}$/.test(rakutenJan) ? rakutenJan : null,
      tagIds: Array.isArray(tagIds) ? tagIds.filter((t): t is string => typeof t === 'string') : [],
    }];
  });
}

function parseIds(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && !!v))] : [];
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = (await request.json()) as { action?: unknown; items?: unknown; playlistIds?: unknown; playlistId?: unknown; title?: unknown; query?: unknown };
  const now = new Date();
  const candidates = adminDb.collection('collection_candidates');

  if (body.action === 'videos') {
    const playlistId = typeof body.playlistId === 'string' ? body.playlistId : '';
    if (!/^[\w-]+$/.test(playlistId)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    const snap = await candidates.doc(playlistId).get();
    if (!snap.exists) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    // playlistItems・videos とも50本ごとに1ユニット
    const quota = await checkCollectionQuota(Math.ceil(((snap.data()!.videoCount as number) ?? 0) / 50) * 2 + 2);
    if (!quota.ok) return NextResponse.json({ error: 'quota_exceeded', remaining: quota.remaining }, { status: 429 });
    resetQuotaCounter();
    try {
      const items = await fetchPlaylistItems(playlistId);
      const durations = await fetchVideoDurations(items.map((i) => i.youtubeVideoId));
      return NextResponse.json({
        videos: items.map((i) => ({
          videoId: i.youtubeVideoId,
          title: i.title,
          thumbnailUrl: i.thumbnailUrl,
          position: i.position,
          publishedAt: i.publishedAt,
          durationSeconds: durations.get(i.youtubeVideoId) ?? null,
        })),
      });
    } catch (e) {
      if (e instanceof YouTubeApiError) {
        console.error('収集候補の動画一覧の取得に失敗', playlistId, e);
        return NextResponse.json({ error: 'youtube_api_error' }, { status: 502 });
      }
      throw e;
    } finally {
      await addCollectionQuotaUsage(getQuotaConsumed());
    }
  }

  if (body.action === 'rakuten_search') {
    const playlistId = typeof body.playlistId === 'string' ? body.playlistId : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!/^[\w-]+$/.test(playlistId) || !title || title.length > MAX_GAME_TITLE_LENGTH || query.length > MAX_GAME_TITLE_LENGTH) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const ref = candidates.doc(playlistId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()!.status !== 'pending') {
      return NextResponse.json({ error: 'not_pending' }, { status: 404 });
    }
    try {
      const result = await searchRakutenForGameTitle(query || title);
      const rakutenSearch = { title, query: result.query, items: result.items, searchedAt: now };
      await ref.update({ rakutenSearch });
      return NextResponse.json({ title, query: result.query, items: result.items });
    } catch (e) {
      if (e instanceof RakutenApiError) {
        console.error('収集候補の楽天ブックス検索に失敗', playlistId, e);
        return NextResponse.json({ error: 'rakuten_api_error' }, { status: 502 });
      }
      throw e;
    }
  }

  if (body.action === 'reject' || body.action === 'restore') {
    const ids = parseIds(body.playlistIds);
    if (ids.length === 0 || ids.length > MAX_STATUS_CHANGE_PER_REQUEST) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const from = body.action === 'reject' ? 'pending' : 'rejected';
    const snaps = await adminDb.getAll(...ids.map((id) => candidates.doc(id)));
    const batch = adminDb.batch();
    let updated = 0;
    for (const snap of snaps) {
      if (!snap.exists || snap.data()!.status !== from) continue;
      batch.update(
        snap.ref,
        body.action === 'reject'
          ? { status: 'rejected', reviewedAt: now, reviewedBy: auth.uid, reviewComment: null }
          : { status: 'pending', reviewedAt: null, reviewedBy: null, reviewComment: null },
      );
      updated++;
    }
    await batch.commit();
    return NextResponse.json({ updated });
  }

  if (body.action !== 'approve') {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }

  const items = parseApproveItems(body.items);
  if (items.length === 0 || items.length > MAX_APPROVE_PER_REQUEST) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const snaps = await adminDb.getAll(...items.map((i) => candidates.doc(i.playlistId)));
  const candidateById = new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s.data()!]));

  // 見込み消費: 動画の取得（playlistItems + videos、50本ごとに各1ユニット）＋ 再生リスト・チャンネルの取得（§6）
  const estimated = items.reduce((sum, i) => sum + Math.ceil(((candidateById.get(i.playlistId)?.videoCount as number) ?? 0) / 50) * 2 + 2, 0);
  const quota = await checkCollectionQuota(estimated);
  if (!quota.ok) return NextResponse.json({ error: 'quota_exceeded', remaining: quota.remaining }, { status: 429 });

  const operatorTagIds = new Set((await fetchOperatorTagIdsByName()).values());
  const results: ApproveResult[] = [];
  // 新しいゲーム名がある承認のときだけ games・マスタを読む
  const gameResolver: CollectionGameResolver | null = items.some((i) => !i.gameId) ? await createCollectionGameResolver() : null;
  resetQuotaCounter();

  try {
    for (const item of items) {
      const candidate = candidateById.get(item.playlistId);
      if (!candidate || candidate.status !== 'pending') {
        results.push({ playlistId: item.playlistId, ok: false, error: 'not_pending' });
        continue;
      }
      const tagIds = [...new Set(item.tagIds)].filter((t) => operatorTagIds.has(t));
      const candidateRef = candidates.doc(item.playlistId);

      let gameId = item.gameId;
      let createdGame: ApproveResult['createdGame'];
      if (!gameId) {
        try {
          const resolved = await gameResolver!.resolve(item.newGameTitle!, item.rakutenJan);
          gameId = resolved.gameId;
          if (resolved.created) createdGame = { id: resolved.gameId, title: item.newGameTitle! };
        } catch (e) {
          console.error('収集候補のゲームタイトル登録に失敗', item.playlistId, e);
          results.push({ playlistId: item.playlistId, ok: false, error: 'game_create_failed' });
          continue;
        }
      }

      let result;
      try {
        result = await registerPlaylist({
          playlistUrl: `https://www.youtube.com/playlist?list=${item.playlistId}`,
          gameId,
          registeredBy: auth.uid,
          proposedBy: null,
          fixedTagIds: tagIds,
        });
      } catch (e) {
        console.error('収集候補の登録に失敗', item.playlistId, e);
        results.push({ playlistId: item.playlistId, ok: false, error: 'register_failed', createdGame });
        continue;
      }

      const error = 'error' in result ? result.error : null;
      if (!error || error === 'already_registered') {
        // 別経路で登録済みだった場合も、候補としては片付いたので成功扱い（§4.2）
        await candidateRef.update({
          status: 'registered',
          reviewedAt: new Date(),
          reviewedBy: auth.uid,
          registeredPlaylistId: item.playlistId,
        });
        // 別経路で登録済みだったときは今回のゲームは付いていないので、使ったことにしない
        if (!error) gameResolver?.markUsed(gameId);
        results.push({ playlistId: item.playlistId, ok: true, createdGame });
      } else if (error === 'not_public' || error === 'playlist_not_found') {
        // YouTube 側で非公開・削除になっていた候補は自動で却下する（§4.2）
        await candidateRef.update({
          status: 'rejected',
          reviewedAt: new Date(),
          reviewedBy: auth.uid,
          reviewComment: error,
        });
        results.push({ playlistId: item.playlistId, ok: false, error, createdGame });
      } else {
        results.push({ playlistId: item.playlistId, ok: false, error, createdGame });
      }
    }
  } finally {
    await addCollectionQuotaUsage(getQuotaConsumed());
    // 再生リストが1件も付かなかった新規のゲームタイトルは、0件のまま一覧に出ないよう消す（§4.3）
    if (gameResolver) {
      try {
        const discarded = new Set(await gameResolver.discardUnused());
        for (const r of results) {
          if (r.createdGame && discarded.has(r.createdGame.id)) delete r.createdGame;
        }
      } catch (e) {
        console.error('収集候補の承認で使わなかったゲームタイトルの削除に失敗', e);
      }
    }
  }

  return NextResponse.json({ results });
}
