import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { addCollectionQuotaUsage, checkCollectionQuota } from '@/lib/collection-quota';
import { fetchOperatorTagIdsByName } from '@/lib/exploration-server';
import { createCollectionGameResolver, MAX_GAME_TITLE_LENGTH, type CollectionGameResolver } from '@/lib/collection-game';
import { normalizeForMatch } from '@/lib/exploration-rules';
import { registerPlaylist } from '@/lib/playlist-registration';
import { getQuotaConsumed, resetQuotaCounter } from '@/lib/youtube';

// 収集候補の承認・却下API（管理者専用。管理 AI運営者向け収集候補レビューUI仕様書 v2.1 §4・§5）。
// action:
//   approve { items: [{ playlistId, gameId?, newGameTitle?, tagIds }] }  まとめて登録（最大50件、1件ずつ順に処理）
//           gameId が無い候補は newGameTitle のゲームを使う（既存に一致すればそれ、無ければ新規登録。§4.3）
//   reject  { playlistIds }                              却下
//   restore { playlistIds }                              却下済みを未処理に戻す
// 登録処理は管理者用の再生リスト登録と共用（lib/playlist-registration.ts）。タグは運営者タグのみを固定タグとして付ける。
const MAX_APPROVE_PER_REQUEST = 50;
const MAX_STATUS_CHANGE_PER_REQUEST = 500;

type ApproveItem = { playlistId: string; gameId: string | null; newGameTitle: string | null; tagIds: string[] };

type ApproveResult = { playlistId: string; ok: boolean; error?: string; createdGame?: { id: string; title: string } };

function parseApproveItems(value: unknown): ApproveItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (!v || typeof v !== 'object') return [];
    const { playlistId, gameId, newGameTitle, tagIds } = v as Record<string, unknown>;
    if (typeof playlistId !== 'string' || !playlistId) return [];
    const id = typeof gameId === 'string' && gameId ? gameId : null;
    const title = typeof newGameTitle === 'string' && newGameTitle.trim() ? newGameTitle.trim() : null;
    // ゲームはIDか、照合・新規登録に使える名前のどちらかが必須
    if (!id && (!title || title.length > MAX_GAME_TITLE_LENGTH || !normalizeForMatch(title))) return [];
    return [{
      playlistId,
      gameId: id,
      newGameTitle: id ? null : title,
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

  const body = (await request.json()) as { action?: unknown; items?: unknown; playlistIds?: unknown };
  const now = new Date();
  const candidates = adminDb.collection('collection_candidates');

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
          const resolved = await gameResolver!.resolve(item.newGameTitle!);
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
  }

  return NextResponse.json({ results });
}
