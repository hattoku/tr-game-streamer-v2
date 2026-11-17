// 件数（非正規化したカウンタ）の増減の計算。DB を使わない純粋な関数だけを置く（単体テスト: tests/unit/listing-counts.test.ts）。
// 書き込みは lib/listing-counts-server.ts。
//
// 再生リストの件数（Firestore データモデル設計書 §3.2、コンテンツ収集機能仕様書 §10.7）:
//   games.playlistCount・channels.playlistCount・tags.usagePlaylistCount は、掲載中（listed）の再生リストだけを数える。
//   掲載状態・ゲーム・タグのどれが変わっても「変わる前に数えていた分を引き、変わった後に数える分を足す」だけで求まるので、
//   登録・掲載の切り替え・ゲームの付け外し・タグの付け外しはすべて playlistCountDeltas で増減を出す。
// ゲームタイトルの件数（管理 マスタ管理仕様書 §7.1）:
//   genres.gameTitleCount・themes.gameTitleCount は、そのジャンル・テーマのゲームタイトルを数える（掲載状態は関係しない）。
import { countsAsListed } from './listing';

/** 件数に関わる、再生リストの状態 */
export interface PlaylistCountState {
  listed: boolean;
  gameId: string | null;
  /** YouTube のチャンネルID（channels のドキュメントID） */
  channelId: string | null;
  tagIds: readonly string[];
}

/** コレクションごとの、ドキュメントID → 増減（0 のものは持たない） */
export interface PlaylistCountDeltas {
  games: Map<string, number>;
  channels: Map<string, number>;
  tags: Map<string, number>;
}

/** playlists のドキュメントから、件数に関わる状態を取り出す（`listingStatus` が無い移行前のものは掲載中として扱う。lib/listing.ts） */
export function playlistCountStateOf(data: {
  listingStatus?: string | null;
  gameId?: unknown;
  channelId?: unknown;
  playlistTagIds?: unknown;
}): PlaylistCountState {
  return {
    listed: countsAsListed(data),
    gameId: typeof data.gameId === 'string' && data.gameId ? data.gameId : null,
    channelId: typeof data.channelId === 'string' && data.channelId ? data.channelId : null,
    tagIds: Array.isArray(data.playlistTagIds) ? data.playlistTagIds.filter((id): id is string => typeof id === 'string' && !!id) : [],
  };
}

function add(map: Map<string, number>, id: string, delta: number) {
  const next = (map.get(id) ?? 0) + delta;
  if (next === 0) map.delete(id);
  else map.set(id, next);
}

function addContribution(deltas: PlaylistCountDeltas, state: PlaylistCountState | null, sign: 1 | -1) {
  if (!state?.listed) return;
  if (state.gameId) add(deltas.games, state.gameId, sign);
  if (state.channelId) add(deltas.channels, state.channelId, sign);
  for (const id of new Set(state.tagIds)) add(deltas.tags, id, sign);
}

/**
 * 再生リストが before から after に変わったときの件数の増減。
 * before が null は新しく作るとき（登録）、after が null は消すとき。
 */
export function playlistCountDeltas(before: PlaylistCountState | null, after: PlaylistCountState | null): PlaylistCountDeltas {
  const deltas: PlaylistCountDeltas = { games: new Map(), channels: new Map(), tags: new Map() };
  addContribution(deltas, before, -1);
  addContribution(deltas, after, 1);
  return deltas;
}

export function hasCountDeltas(deltas: PlaylistCountDeltas): boolean {
  return deltas.games.size > 0 || deltas.channels.size > 0 || deltas.tags.size > 0;
}

/** 件数に関わる、ゲームタイトルの状態 */
export interface GameMasterState {
  genreId: string | null;
  themeIds: readonly string[];
}

/** ジャンル・テーマごとの増減（0 のものは持たない） */
export interface GameMasterCountDeltas {
  genres: Map<string, number>;
  themes: Map<string, number>;
}

/** ゲームタイトルが before から after に変わったときの、genres・themes の gameTitleCount の増減（null は作る・消すとき） */
export function gameMasterCountDeltas(before: GameMasterState | null, after: GameMasterState | null): GameMasterCountDeltas {
  const deltas: GameMasterCountDeltas = { genres: new Map(), themes: new Map() };
  for (const [state, sign] of [
    [before, -1],
    [after, 1],
  ] as const) {
    if (!state) continue;
    if (state.genreId) add(deltas.genres, state.genreId, sign);
    for (const id of new Set(state.themeIds)) add(deltas.themes, id, sign);
  }
  return deltas;
}
