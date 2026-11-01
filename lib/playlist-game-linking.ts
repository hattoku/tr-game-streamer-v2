// ゲーム未設定（playlists.gameId = null）の再生リストにゲームを付ける・外す共通処理（サーバー専用。
// 収集候補レビューUI仕様書 v2.5 §3.9・§6.5、データモデル設計書 v1.28 の playlists.gameHint / gameSetBy / gameSetAt）。
// 付け外しでは playlists.gameId / gameName / gameGenreIds と games.playlistCount を必ず一緒に直す。
// 履歴は playlist_game_changes に残す（クライアントからは読み書きできない。管理画面の「戻す」の元）。
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { guessGame, normalizeForMatch } from '@/lib/exploration-rules';
import { countsAsListed } from '@/lib/listing';

export type GameSetBy = 'admin' | 'auto' | 'user';

interface GameForLinking {
  id: string;
  title: string;
  aliases: string[];
}

/** ヒントが無いときの包含照合で、別名も1つのゲームとして扱うための一時的な形 */
function namesOf(game: GameForLinking): string[] {
  return [game.title, ...game.aliases];
}

/**
 * 再生リストに合うゲームを返す。
 * ヒントがあれば、ヒントとゲームのタイトル・別名が正規化して完全一致するものだけ（誤爆を避ける）。
 * ヒントが無ければ、再生リスト名にタイトルが含まれるもの（正規化後3文字以上のうち最長一致。別名は使わず、続編・番号違いは付けない）。
 * `rejectedGameIds` は管理者が「違う」と戻したゲームなので、自動では付けない。
 */
export function matchGameForPlaylist(
  playlist: { title: string; gameHint: string | null; rejectedGameIds?: string[] },
  games: readonly GameForLinking[],
): GameForLinking | null {
  const rejected = new Set(playlist.rejectedGameIds ?? []);
  const candidates = games.filter((g) => !rejected.has(g.id));
  const hint = playlist.gameHint ? normalizeForMatch(playlist.gameHint) : '';
  if (hint) {
    return candidates.find((g) => namesOf(g).some((n) => normalizeForMatch(n) === hint)) ?? null;
  }
  // ヒントが無いときは誤爆を避けるため、別名は使わずタイトルだけで照合し、続編・番号違い（「RE:4」「2」「III」など）は付けない
  const match = guessGame(playlist.title, candidates);
  if (!match) return null;
  const title = normalizeForMatch(playlist.title);
  const rest = title.slice(title.indexOf(normalizeForMatch(match.title)) + normalizeForMatch(match.title).length);
  if (/^[a-z]{0,2}\d/.test(rest) || /^(?:i{1,3}|iv|vi{0,3}|ix|x)(?![a-z])/.test(rest)) return null;
  return match;
}

export type LinkResult = 'linked' | 'already_set' | 'playlist_not_found' | 'game_not_found' | 'rejected_game' | 'daily_limit';

/** 一般ユーザーが1日に登録できる件数（直近ではなく日本時間の暦日。カウンターを同じトランザクションで数えて競合を防ぐ） */
export const USER_DAILY_LINK_LIMIT = 20;

function todayKey(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** ゲーム未設定の再生リストにゲームを付ける。すでに付いていれば何もしない（先に設定した方を優先） */
export async function linkPlaylistToGame(playlistId: string, gameId: string, by: GameSetBy, userId: string | null): Promise<LinkResult> {
  const playlistRef = adminDb.collection('playlists').doc(playlistId);
  const gameRef = adminDb.collection('games').doc(gameId);
  return adminDb.runTransaction(async (tx) => {
    // 一般ユーザーは、1日の上限と、管理者が外したゲームの除外もここ（トランザクション内）で確かめる
    const counterRef = by === 'user' && userId ? adminDb.collection('game_link_counters').doc(`${userId}_${todayKey()}`) : null;
    const [playlistSnap, gameSnap, counterSnap] = await Promise.all([tx.get(playlistRef), tx.get(gameRef), counterRef ? tx.get(counterRef) : Promise.resolve(null)]);
    if (!playlistSnap.exists) return 'playlist_not_found';
    if (!gameSnap.exists) return 'game_not_found';
    if (playlistSnap.data()!.gameId) return 'already_set';
    if (by === 'user' && ((playlistSnap.data()!.rejectedGameIds as string[] | undefined) ?? []).includes(gameId)) return 'rejected_game';
    if (counterRef && ((counterSnap?.data()?.count as number | undefined) ?? 0) >= USER_DAILY_LINK_LIMIT) return 'daily_limit';
    const game = gameSnap.data()!;
    const now = new Date();
    if (counterRef) tx.set(counterRef, { userId, date: todayKey(), count: FieldValue.increment(1), updatedAt: now }, { merge: true });
    tx.update(playlistRef, {
      gameId,
      gameName: game.title ?? '',
      gameGenreIds: game.genreId ? [game.genreId] : [],
      gameSetBy: by,
      gameSetAt: now,
    });
    // 掲載していない再生リストは件数に数えない（コンテンツ収集機能仕様書 §10.7）
    if (countsAsListed(playlistSnap.data()!)) tx.update(gameRef, { playlistCount: FieldValue.increment(1) });
    tx.set(adminDb.collection('playlist_game_changes').doc(), { playlistId, from: null, to: gameId, by, userId, at: now });
    return 'linked';
  });
}

/** ゲームを外してゲーム未設定に戻す。外したゲームは rejectedGameIds に足し、自動では付け直さない */
export async function unlinkPlaylistGame(playlistId: string, userId: string | null): Promise<'unlinked' | 'playlist_not_found' | 'not_set'> {
  const playlistRef = adminDb.collection('playlists').doc(playlistId);
  return adminDb.runTransaction(async (tx) => {
    const playlistSnap = await tx.get(playlistRef);
    if (!playlistSnap.exists) return 'playlist_not_found';
    const gameId = playlistSnap.data()!.gameId as string | null;
    if (!gameId) return 'not_set';
    const gameRef = adminDb.collection('games').doc(gameId);
    const gameSnap = await tx.get(gameRef);
    const now = new Date();
    tx.update(playlistRef, {
      gameId: null,
      gameName: '',
      gameGenreIds: [],
      gameSetBy: null,
      gameSetAt: null,
      rejectedGameIds: FieldValue.arrayUnion(gameId),
    });
    if (gameSnap.exists && countsAsListed(playlistSnap.data()!)) tx.update(gameRef, { playlistCount: FieldValue.increment(-1) });
    tx.set(adminDb.collection('playlist_game_changes').doc(), { playlistId, from: gameId, to: null, by: 'admin', userId, at: now });
    return 'unlinked';
  });
}

/**
 * ゲーム未設定の再生リストを照合して、合うゲームを付ける。
 * gameIds を渡すと、そのゲーム（登録・編集したもの）だけを照合の対象にする。省略するとすべてのゲーム。
 */
export async function autoLinkUnsetPlaylists(gameIds?: string[]): Promise<{ scanned: number; linked: number }> {
  const unset = await adminDb.collection('playlists').where('gameId', '==', null).get();
  if (unset.empty) return { scanned: 0, linked: 0 };
  const gameDocs = gameIds
    ? (await adminDb.getAll(...gameIds.map((id) => adminDb.collection('games').doc(id)))).filter((d) => d.exists)
    : (await adminDb.collection('games').get()).docs;
  const games: GameForLinking[] = gameDocs.map((d) => ({
    id: d.id,
    title: (d.data()!.title as string) ?? '',
    aliases: (d.data()!.aliases as string[] | undefined) ?? [],
  }));
  if (games.length === 0) return { scanned: unset.size, linked: 0 };

  let linked = 0;
  for (const doc of unset.docs) {
    const data = doc.data();
    const match = matchGameForPlaylist(
      { title: (data.title as string) ?? '', gameHint: (data.gameHint as string | null) ?? null, rejectedGameIds: data.rejectedGameIds as string[] | undefined },
      games,
    );
    if (!match) continue;
    if ((await linkPlaylistToGame(doc.id, match.id, 'auto', null)) === 'linked') linked++;
  }
  return { scanned: unset.size, linked };
}

/** ゲームの登録・編集の後に呼ぶ。照合の失敗でゲームの保存を失敗させないよう、例外は記録するだけにする */
export async function autoLinkAfterGameChange(gameIds: string[]): Promise<void> {
  try {
    await autoLinkUnsetPlaylists(gameIds);
  } catch (e) {
    console.error('ゲーム未設定の再生リストの自動照合に失敗', e);
  }
}
