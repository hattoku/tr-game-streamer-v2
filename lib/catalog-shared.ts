// 一覧のサーバー側検索（リブランディング段階7）のクライアント・サーバー共用部分。
// 型・検索条件の読み取り・キーワードの正規化を置く（Firebase の SDK は読み込まない）。
// 仕様: 共通 一覧のサーバー側検索 仕様書。サーバー側は lib/catalog-server.ts、呼び出し側は lib/catalog.ts。
import type { ResolvedTag } from './tags-shared';

/** 一覧の1ページの件数（探す・ゲーム・チャンネルの各仕様書 §3.6 等。20件/ページ） */
export const CATALOG_PAGE_SIZE = 20;

/** キーワードの最大文字数（これより長い部分は使わない） */
export const MAX_KEYWORD_LENGTH = 100;

/** 一度に指定できるタグ・ジャンルの最大数 */
export const MAX_FILTER_IDS = 20;

/** TOP のカルーセル1つに出す最大件数（ページ top 仕様書 §6.4・§7.3・§8.4、v2.1） */
export const TOP_CAROUSEL_LIMIT = 20;

/**
 * 注目の再生リストはログイン中のユーザーの完走済みを画面側で除くため、表示件数より多めに返す（ページ top 仕様書 §6.4）。
 * 除いた分の補充はしない（§6.4）が、上位が完走済みばかりでも空になりにくいようにする。
 */
export const TOP_FEATURED_FETCH_LIMIT = 40;

/** 公開再生リストのカード1枚分（ページ 再生リストを探す 仕様書 §3.3） */
export interface PlaylistSummary {
  id: string;
  title: string;
  thumbnailUrl: string;
  channelName: string;
  channelIconUrl: string;
  gameId: string | null;
  gameName: string;
  /** ゲーム未設定の再生リストが持つ未確定のゲーム名（検索の対象。v1.10）。無ければ空 */
  gameHint: string;
  /** 登録時にゲームタイトルの`genreId`から1件セットされるジャンルID。TOPページ注目セクションのジャンルタブ絞り込みで使用 */
  gameGenreIds: string[];
  videoCount: number;
  score: number | null;
  mylistCount: number;
  reviewCount: number;
  latestVideoPublishedAt: number | null;
  registeredAt: number;
  tags: ResolvedTag[];
}

export type PlaylistSort = 'score' | 'mylist' | 'newest';
export const PLAYLIST_SORTS: readonly PlaylistSort[] = ['score', 'mylist', 'newest'];

/** `popular` は人気順（ピン留め→人気の点数。共通 人気のチャンネル 集計 仕様書 §5）。既定 */
export type ChannelSort = 'popular' | 'playlistCount' | 'name' | 'videoCount';
export const CHANNEL_SORTS: readonly ChannelSort[] = ['popular', 'playlistCount', 'name', 'videoCount'];

export type GameSort = 'playlistCount' | 'title' | 'videoCount';
export const GAME_SORTS: readonly GameSort[] = ['playlistCount', 'title', 'videoCount'];

/** 1ページ分の結果。`page` はサーバーが実際に返したページ（範囲外を指定すると最後のページに丸める） */
export interface CatalogPage<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}

export interface PlaylistSearchResult extends CatalogPage<PlaylistSummary> {
  /** 条件に合う再生リスト全体の動画数の合計（ゲーム・チャンネル詳細の「N 動画」） */
  totalVideoCount: number;
  /** 同じくレビュー数の合計（チャンネル詳細の「N レビュー」、ページ チャンネル 詳細 仕様書 §8.2） */
  totalReviewCount: number;
  /** 同じくマイリスト登録数の合計（チャンネル詳細の「N マイリスト」） */
  totalMylistCount: number;
}

/** チャンネルカードのピックアップ再生リスト1件分（ページ チャンネル 探す 仕様書 §3.3） */
export interface ChannelPickupPlaylist {
  id: string;
  title: string;
  thumbnailUrl: string;
  score: number | null;
}

export interface ChannelListItem {
  id: string;
  name: string;
  iconUrl: string;
  /** このチャンネルの掲載中の再生リスト数 */
  playlistCount: number;
  /** このチャンネルの掲載中の再生リストの動画数合計 */
  videoCount: number;
  /** このチャンネルの掲載中の再生リストのレビュー数合計（ページ チャンネル 探す 仕様書 §9.3） */
  reviewCount: number;
  /** スコアが高い順の上位3件（評価なしは末尾） */
  topPlaylists: ChannelPickupPlaylist[];
}

export interface GameListItem {
  id: string;
  title: string;
  packageImageUrl: string | null;
  genreId: string | null;
  genreName: string;
  /** このゲームの掲載中の再生リスト数 */
  playlistCount: number;
  /** このゲームの掲載中の再生リストの動画数合計 */
  videoCount: number;
  tags: ResolvedTag[];
}

/** TOP の「人気のチャンネル」のカード1枚分（ページ top 仕様書 §6A.4） */
export interface PopularChannelItem {
  id: string;
  name: string;
  iconUrl: string;
  /** 掲載中の再生リスト数 */
  playlistCount: number;
}

/** TOP の各セクションに出す再生リスト（ページ top 仕様書）。カードは `playlists` に1回ずつ入れ、各セクションは ID で引く */
export interface TopCatalog {
  playlists: PlaylistSummary[];
  /** 注目の再生リスト（§6）。スコアのあるものをスコアの高い順に最大 TOP_FEATURED_FETCH_LIMIT 件 */
  featured: {
    overall: string[];
    /** ジャンルID → そのジャンルの上位（§6.3 のジャンルタブ） */
    byGenre: Record<string, string[]>;
  };
  /** 新着の再生リスト（§7）。登録日の新しい順に最大 TOP_CAROUSEL_LIMIT 件 */
  newArrivals: string[];
  /** タグピックアップ（§8）。使用数の多いタグ上位6件のうち、掲載中の再生リストがあるもの */
  tagPickups: Array<{ tagId: string; tagName: string; ids: string[] }>;
  /** 人気のチャンネル（§6A）。チャンネル一覧の人気順の先頭 TOP_CAROUSEL_LIMIT 件 */
  popularChannels: PopularChannelItem[];
}

/**
 * キーワード照合用の正規化。全角・半角の違い（NFKC）、大文字・小文字、カタカナ・ひらがなの違いを無視する
 * （共通 一覧のサーバー側検索 仕様書 §4.1）。前後と連続する空白も詰める。
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, ' ')
    .trim();
}

/** `?tags=a,b` のようなカンマ区切りの ID 一覧を読む（空・重複を除き、最大 MAX_FILTER_IDS 件） */
export function parseIdList(raw: string | null): string[] {
  if (!raw) return [];
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 200);
  return [...new Set(ids)].slice(0, MAX_FILTER_IDS);
}

/** `?page=` を読む（1 以上の整数。読めなければ 1） */
export function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function parseEnum<T extends string>(raw: string | null, values: readonly T[], fallback: T): T {
  return (values as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback;
}

export function parseKeyword(raw: string | null): string {
  return (raw ?? '').slice(0, MAX_KEYWORD_LENGTH);
}

/** 配列を1ページ分に切り出す。範囲外のページは最後のページに丸める */
export function paginate<T>(list: T[], page: number, pageSize = CATALOG_PAGE_SIZE): CatalogPage<T> {
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  return { items: list.slice((current - 1) * pageSize, current * pageSize), total: list.length, page: current, pageCount };
}
