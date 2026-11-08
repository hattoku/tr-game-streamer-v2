// 一覧のサーバー側検索（リブランディング段階7。仕様: 共通 一覧のサーバー側検索 仕様書）。
// サーバー専用（API Route からのみ import すること）。
//
// Firestore には部分一致の検索や「タグを全部含む」の絞り込みが無いため、検索面に出す再生リスト
// （公開かつ掲載中）とチャンネル・ゲームタイトル・タグを、サーバー（Cloud Run のインスタンス）のメモリに索引として持ち、
// 絞り込み・並べ替え・ページングはここで行って、画面には1ページ分だけ返す。
//
// 索引は Firestore の変更の購読（onSnapshot）で最新に保つ。最初の1回だけ対象を全件読み、その後は変わった文書の分しか
// 読まない（読み取りの課金も変わった分だけ）。画面からの書き込みも、Admin SDK や別のインスタンスからの書き込みも、
// 数秒以内に反映される。しばらく使われなかった（IDLE_RESYNC_MS）インスタンスは、CPU が止まっている間に購読が
// 切れて遅れている可能性があるため、次に使うときに購読を張り直して全件を読み直す（Firestore も 30 分以上切れた購読の
// 再開は全件の読み取りとして課金するため、張り直しても読み取りは増えない）。
import type { DocumentData, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { checkRateLimit } from './rate-limit';
import { LISTED } from './listing';
import { isListedTag, resolveTags, type TagInfo } from './tags-shared';
import { popularityScore, readPopularity } from './popularity-shared';
import {
  normalizeForSearch,
  paginate,
  TOP_CAROUSEL_LIMIT,
  TOP_FEATURED_FETCH_LIMIT,
  type CatalogPage,
  type ChannelListItem,
  type ChannelSort,
  type GameListItem,
  type GameSort,
  type PlaylistSearchResult,
  type PlaylistSort,
  type PlaylistSummary,
  type PopularChannelItem,
  type TopCatalog,
} from './catalog-shared';

/** これより長く使われなかった索引は、次に使うときに購読を張り直す */
const IDLE_RESYNC_MS = 30 * 60 * 1000;
/** 最初の全件読み込みをこれ以上待たない（待ちきれなければ 503。購読はそのまま続ける） */
const READY_TIMEOUT_MS = 25_000;
/** チャンネルカードのピックアップ再生リストの件数（ページ チャンネル 探す 仕様書 §3.3） */
const PICKUP_COUNT = 3;
/** TOP のタグピックアップに使うタグの数（ページ top 仕様書 §8.2） */
const TAG_PICKUP_COUNT = 6;

// ---- 索引に持つ形 ----

interface PlaylistRecord {
  summary: Omit<PlaylistSummary, 'tags'>;
  channelId: string | null;
  tagIds: string[];
  fixedTagIds: string[];
  /** キーワードの照合先（ゲームタイトル・未確定のゲーム名・チャンネル名を正規化して改行でつないだもの） */
  searchText: string;
}

interface ChannelRecord {
  id: string;
  name: string;
  iconUrl: string;
  searchText: string;
  /** 人気の点数（`channels.popularity` の人数から計算。共通 人気のチャンネル 集計 仕様書 §2.2） */
  popularityScore: number;
}

/** 登録済みの掲載チャンネルのピン留め（`exploration_channels.featuredOrder`、§5） */
interface PinRecord {
  youtubeChannelId: string | null;
  featuredOrder: number | null;
}

interface GameRecord {
  id: string;
  title: string;
  packageImageUrl: string | null;
  genreId: string | null;
  genreName: string;
  tagIds: string[];
  fixedTagIds: string[];
  searchText: string;
}

function millis(value: unknown): number | null {
  return (value as { toMillis?: () => number } | null | undefined)?.toMillis?.() ?? null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toPlaylistRecord(d: QueryDocumentSnapshot<DocumentData>): PlaylistRecord {
  const data = d.data();
  const gameName = str(data.gameName);
  const gameHint = str(data.gameHint);
  const channelName = str(data.channelName);
  return {
    summary: {
      id: d.id,
      title: str(data.title),
      thumbnailUrl: str(data.thumbnailUrl),
      channelName,
      channelIconUrl: str(data.channelIconUrl),
      gameId: typeof data.gameId === 'string' && data.gameId ? data.gameId : null,
      gameName,
      gameHint,
      gameGenreIds: strArray(data.gameGenreIds),
      videoCount: num(data.videoCount),
      score: typeof data.score === 'number' ? data.score : null,
      mylistCount: num(data.mylistCount),
      reviewCount: num(data.reviewCount),
      latestVideoPublishedAt: millis(data.latestVideoPublishedAt),
      registeredAt: millis(data.registeredAt) ?? 0,
    },
    channelId: typeof data.channelId === 'string' && data.channelId ? data.channelId : null,
    tagIds: strArray(data.playlistTagIds),
    fixedTagIds: strArray(data.playlistTagsFixed),
    searchText: [gameName, gameHint, channelName].map(normalizeForSearch).join('\n'),
  };
}

function toChannelRecord(d: QueryDocumentSnapshot<DocumentData>): ChannelRecord {
  const data = d.data();
  const name = str(data.name);
  return {
    id: d.id,
    name,
    iconUrl: str(data.iconUrl),
    searchText: normalizeForSearch(name),
    popularityScore: popularityScore(readPopularity(data.popularity)),
  };
}

function toPinRecord(d: QueryDocumentSnapshot<DocumentData>): PinRecord {
  const data = d.data();
  return {
    youtubeChannelId: typeof data.youtubeChannelId === 'string' && data.youtubeChannelId ? data.youtubeChannelId : null,
    featuredOrder: typeof data.featuredOrder === 'number' && Number.isFinite(data.featuredOrder) ? data.featuredOrder : null,
  };
}

function toGameRecord(d: QueryDocumentSnapshot<DocumentData>): GameRecord {
  const data = d.data();
  const title = str(data.title);
  return {
    id: d.id,
    title,
    packageImageUrl: typeof data.packageImageUrl === 'string' && data.packageImageUrl ? data.packageImageUrl : null,
    genreId: typeof data.genreId === 'string' && data.genreId ? data.genreId : null,
    genreName: str(data.genreName),
    tagIds: strArray(data.gameTagIds),
    fixedTagIds: strArray(data.gameTagsFixed),
    searchText: normalizeForSearch(title),
  };
}

function toTagInfo(d: QueryDocumentSnapshot<DocumentData>): TagInfo {
  const data = d.data();
  return {
    id: d.id,
    name: str(data.name),
    origin: data.origin === 'user' ? 'user' : 'operator',
    createdAt: millis(data.createdAt) ?? 0,
    usageGameCount: num(data.usageGameCount),
    usagePlaylistCount: num(data.usagePlaylistCount),
  };
}

// ---- 購読で最新に保つコレクション ----

interface Snapshot<T> {
  map: Map<string, T>;
  /** 中身が変わるたびに増える（派生データの作り直しの判定に使う） */
  version: number;
}

class LiveCollection<T> {
  private current: Snapshot<T> | null = null;
  private ready: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  private lastUsedAt = 0;
  private version = 0;

  constructor(
    private readonly name: string,
    private readonly makeQuery: () => Query<DocumentData>,
    private readonly toRecord: (d: QueryDocumentSnapshot<DocumentData>) => T,
  ) {}

  async get(): Promise<Snapshot<T>> {
    const now = Date.now();
    if (this.ready && now - this.lastUsedAt > IDLE_RESYNC_MS) this.reset();
    this.lastUsedAt = now;
    if (!this.ready) this.start();
    await withTimeout(this.ready!, READY_TIMEOUT_MS, `${this.name} の読み込みが時間内に終わりませんでした`);
    // 待っている間に購読が失敗して張り直しになった場合
    if (!this.current) throw new CatalogUnavailableError(`${this.name} の購読が止まりました`);
    return this.current;
  }

  private start() {
    const map = new Map<string, T>();
    this.ready = new Promise<void>((resolve, reject) => {
      let first = true;
      const unsubscribe = this.makeQuery().onSnapshot(
        (snap) => {
          for (const change of snap.docChanges()) {
            if (change.type === 'removed') map.delete(change.doc.id);
            else map.set(change.doc.id, this.toRecord(change.doc));
          }
          this.version += 1;
          this.current = { map, version: this.version };
          if (first) {
            first = false;
            resolve();
          }
        },
        (error) => {
          console.error(`[catalog] ${this.name} の購読が止まりました`, error);
          // 次に使うときに張り直す。最初の読み込み中なら待っている呼び出しにも失敗を返す
          if (this.unsubscribe === unsubscribe) this.reset();
          if (first) reject(error);
        },
      );
      this.unsubscribe = unsubscribe;
    });
    // 待っている呼び出しが無いときの失敗で unhandled rejection にしない
    this.ready.catch(() => {});
  }

  private reset() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.ready = null;
    this.current = null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CatalogUnavailableError(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** 索引が用意できない（最初の読み込みが終わらない・購読が失敗した）。API は 503 を返す */
export class CatalogUnavailableError extends Error {}

interface CatalogState {
  playlists: LiveCollection<PlaylistRecord>;
  channels: LiveCollection<ChannelRecord>;
  games: LiveCollection<GameRecord>;
  tags: LiveCollection<TagInfo>;
  pins: LiveCollection<PinRecord>;
  derived: Map<string, unknown>;
}

// 開発サーバーの再読み込みで購読が二重にならないよう globalThis に置く
const globalForCatalog = globalThis as unknown as { __puremiteCatalog?: CatalogState };

function state(): CatalogState {
  if (!globalForCatalog.__puremiteCatalog) {
    globalForCatalog.__puremiteCatalog = {
      // 検索面に出すのは公開かつ掲載中だけ（コンテンツ収集機能仕様書 §10.7）。等価条件のみのため複合インデックスは不要
      playlists: new LiveCollection(
        'playlists',
        () => adminDb.collection('playlists').where('isPublic', '==', true).where('listingStatus', '==', LISTED),
        toPlaylistRecord,
      ),
      channels: new LiveCollection('channels', () => adminDb.collection('channels'), toChannelRecord),
      games: new LiveCollection('games', () => adminDb.collection('games'), toGameRecord),
      tags: new LiveCollection('tags', () => adminDb.collection('tags'), toTagInfo),
      // ピン留め（段階5）。登録済み（active）の掲載チャンネルだけ。等価条件のみのため複合インデックスは不要
      pins: new LiveCollection('exploration_channels', () => adminDb.collection('exploration_channels').where('status', '==', 'active'), toPinRecord),
      derived: new Map(),
    };
  }
  return globalForCatalog.__puremiteCatalog;
}

/** 索引の版が同じあいだは作り直さない派生データ（並べ替え済みの一覧・集計） */
function memo<T>(name: string, versions: number[], build: () => T): T {
  const derived = state().derived;
  const key = `${name}@${versions.join('.')}`;
  const hit = derived.get(name) as { key: string; value: T } | undefined;
  if (hit && hit.key === key) return hit.value;
  const value = build();
  derived.set(name, { key, value });
  return value;
}

// ---- 並べ替え ----

const collator = new Intl.Collator('ja');

type Comparator = (a: PlaylistRecord, b: PlaylistRecord) => number;

// 同じ値どうしの並びがページをまたいで入れ替わらないよう、最後は登録日・ID で必ず順番を決める
const tieBreak: Comparator = (a, b) => b.summary.registeredAt - a.summary.registeredAt || (a.summary.id < b.summary.id ? -1 : a.summary.id > b.summary.id ? 1 : 0);
const byScore: Comparator = (a, b) => (b.summary.score ?? -1) - (a.summary.score ?? -1);
const byMylist: Comparator = (a, b) => b.summary.mylistCount - a.summary.mylistCount;

const PLAYLIST_COMPARATORS: Record<PlaylistSort, Comparator> = {
  // スコアが高い順。評価なし（null）は末尾（再生リストを探す 仕様書 §5.4）
  score: (a, b) => byScore(a, b) || byMylist(a, b) || tieBreak(a, b),
  mylist: (a, b) => byMylist(a, b) || byScore(a, b) || tieBreak(a, b),
  // 最新の動画の投稿日が新しい順（§5.2）。投稿日が無いものは末尾
  newest: (a, b) => (b.summary.latestVideoPublishedAt ?? 0) - (a.summary.latestVideoPublishedAt ?? 0) || tieBreak(a, b),
};

// ---- 再生リスト ----

interface ListedPlaylists {
  /** 並べ方ごとに並べ替え済みの一覧 */
  sorted: Record<PlaylistSort, PlaylistRecord[]>;
  tagsMap: Map<string, TagInfo>;
  versions: number[];
}

async function listedPlaylists(): Promise<ListedPlaylists> {
  const s = state();
  const [playlists, tags] = await Promise.all([s.playlists.get(), s.tags.get()]);
  const versions = [playlists.version, tags.version];
  const sorted = memo('playlists.sorted', [playlists.version], () => {
    const all = [...playlists.map.values()];
    return {
      score: [...all].sort(PLAYLIST_COMPARATORS.score),
      mylist: [...all].sort(PLAYLIST_COMPARATORS.mylist),
      newest: [...all].sort(PLAYLIST_COMPARATORS.newest),
    };
  });
  return { sorted, tagsMap: tags.map, versions };
}

function toSummary(r: PlaylistRecord, tagsMap: Map<string, TagInfo>): PlaylistSummary {
  return { ...r.summary, tags: resolveTags(r.tagIds, r.fixedTagIds, tagsMap) };
}

/** キーワードを空白で区切り、すべての語が含まれるか（共通 一覧のサーバー側検索 仕様書 §4.1） */
function keywordMatcher(keyword: string): ((searchText: string) => boolean) | null {
  const terms = normalizeForSearch(keyword).split(' ').filter(Boolean);
  if (terms.length === 0) return null;
  return (text) => terms.every((t) => text.includes(t));
}

export interface PlaylistSearchParams {
  keyword: string;
  tagIds: string[];
  sort: PlaylistSort;
  page: number;
  gameId?: string | null;
  channelId?: string | null;
}

/** 再生リストを探す・ゲームタイトル詳細・チャンネル詳細の一覧（公開かつ掲載中だけ） */
export async function searchPlaylists(params: PlaylistSearchParams): Promise<PlaylistSearchResult> {
  const { sorted, tagsMap } = await listedPlaylists();
  const matchKeyword = keywordMatcher(params.keyword);
  const filtered = sorted[params.sort].filter((r) => {
    if (params.gameId && r.summary.gameId !== params.gameId) return false;
    if (params.channelId && r.channelId !== params.channelId) return false;
    if (params.tagIds.length > 0 && !params.tagIds.every((id) => r.tagIds.includes(id))) return false;
    if (matchKeyword && !matchKeyword(r.searchText)) return false;
    return true;
  });
  const page = paginate(filtered, params.page);
  return {
    ...page,
    items: page.items.map((r) => toSummary(r, tagsMap)),
    totalVideoCount: filtered.reduce((sum, r) => sum + r.summary.videoCount, 0),
    totalReviewCount: filtered.reduce((sum, r) => sum + r.summary.reviewCount, 0),
    totalMylistCount: filtered.reduce((sum, r) => sum + r.summary.mylistCount, 0),
  };
}

// ---- チャンネル ----

interface ChannelAggregate {
  playlistCount: number;
  videoCount: number;
  reviewCount: number;
  topPlaylists: PlaylistRecord[];
}

/** チャンネルごとの掲載中の再生リスト数・動画数・スコア上位3件（ページ チャンネル 探す 仕様書 §3.3） */
function channelAggregates(listed: ListedPlaylists): Map<string, ChannelAggregate> {
  return memo('channels.aggregates', listed.versions.slice(0, 1), () => {
    const map = new Map<string, ChannelAggregate>();
    // スコア順の一覧を先頭から見るので、各チャンネルの最初の3件がそのままピックアップになる
    for (const r of listed.sorted.score) {
      if (!r.channelId) continue;
      const entry = map.get(r.channelId) ?? { playlistCount: 0, videoCount: 0, reviewCount: 0, topPlaylists: [] };
      entry.playlistCount += 1;
      entry.videoCount += r.summary.videoCount;
      entry.reviewCount += r.summary.reviewCount;
      if (entry.topPlaylists.length < PICKUP_COUNT) entry.topPlaylists.push(r);
      map.set(r.channelId, entry);
    }
    return map;
  });
}

export interface ChannelSearchParams {
  keyword: string;
  sort: ChannelSort;
  page: number;
}

interface ChannelIndex {
  /** 掲載中の再生リストがあるチャンネルを人気順（§5）に並べたもの */
  popular: ChannelListItem[];
  searchTextById: Map<string, string>;
}

const byChannelName = (a: ChannelListItem, b: ChannelListItem) => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : 1);

/**
 * 掲載中の再生リストが1件以上あるチャンネルを、人気順に並べる（共通 人気のチャンネル 集計 仕様書 §5）。
 * ピン留め（`featuredOrder` の小さい順）→ 人気の点数の高い順 → 再生リスト数の多い順 → チャンネル名順。
 * チャンネル一覧の `sort=popular` と TOP の「人気のチャンネル」で同じ並びを使う。
 */
async function channelIndex(): Promise<ChannelIndex> {
  const s = state();
  const [listed, channels, pins] = await Promise.all([listedPlaylists(), s.channels.get(), s.pins.get()]);
  const aggregates = channelAggregates(listed);
  return memo('channels.index', [listed.versions[0], channels.version, pins.version], () => {
    // 同じ YouTube チャンネルに登録済みの行が複数あれば、小さい方の順を使う
    const pinOrder = new Map<string, number>();
    for (const p of pins.map.values()) {
      if (!p.youtubeChannelId || p.featuredOrder === null) continue;
      const prev = pinOrder.get(p.youtubeChannelId);
      if (prev === undefined || p.featuredOrder < prev) pinOrder.set(p.youtubeChannelId, p.featuredOrder);
    }
    const scoreById = new Map<string, number>();
    const list: ChannelListItem[] = [];
    for (const c of channels.map.values()) {
      const agg = aggregates.get(c.id);
      if (!agg) continue;
      scoreById.set(c.id, c.popularityScore);
      list.push({
        id: c.id,
        name: c.name,
        iconUrl: c.iconUrl,
        playlistCount: agg.playlistCount,
        videoCount: agg.videoCount,
        reviewCount: agg.reviewCount,
        topPlaylists: agg.topPlaylists.map((r) => ({ id: r.summary.id, title: r.summary.title, thumbnailUrl: r.summary.thumbnailUrl, score: r.summary.score })),
      });
    }
    list.sort((a, b) => {
      const pa = pinOrder.get(a.id);
      const pb = pinOrder.get(b.id);
      if (pa !== undefined || pb !== undefined) {
        if (pa === undefined) return 1;
        if (pb === undefined) return -1;
        if (pa !== pb) return pa - pb;
      }
      return (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0) || b.playlistCount - a.playlistCount || byChannelName(a, b);
    });
    return { popular: list, searchTextById: new Map([...channels.map.values()].map((c) => [c.id, c.searchText])) };
  });
}

/** チャンネル名から探す。掲載中の再生リストが1件以上あるチャンネルだけ（ページ チャンネル 探す 仕様書 §9.1） */
export async function searchChannels(params: ChannelSearchParams): Promise<CatalogPage<ChannelListItem>> {
  const { popular, searchTextById } = await channelIndex();
  const matchKeyword = keywordMatcher(params.keyword);
  const filtered = matchKeyword ? popular.filter((c) => matchKeyword(searchTextById.get(c.id) ?? '')) : [...popular];
  if (params.sort !== 'popular') {
    filtered.sort((a, b) => {
      if (params.sort === 'name') return byChannelName(a, b);
      const diff = params.sort === 'videoCount' ? b.videoCount - a.videoCount : b.playlistCount - a.playlistCount;
      // 同数はチャンネル名順（§5.2）
      return diff || byChannelName(a, b);
    });
  }
  return paginate(filtered, params.page);
}

// ---- ゲームタイトル ----

export interface GameSearchParams {
  keyword: string;
  genreIds: string[];
  tagIds: string[];
  sort: GameSort;
  page: number;
}

/** ゲームタイトルから探す。件数は掲載中の再生リストだけで数える（ページ ゲームタイトル 探す 仕様書 v1.5） */
export async function searchGames(params: GameSearchParams): Promise<CatalogPage<GameListItem>> {
  const [listed, games] = await Promise.all([listedPlaylists(), state().games.get()]);
  const counts = memo('games.counts', listed.versions.slice(0, 1), () => {
    const map = new Map<string, { playlistCount: number; videoCount: number }>();
    for (const r of listed.sorted.score) {
      if (!r.summary.gameId) continue;
      const entry = map.get(r.summary.gameId) ?? { playlistCount: 0, videoCount: 0 };
      entry.playlistCount += 1;
      entry.videoCount += r.summary.videoCount;
      map.set(r.summary.gameId, entry);
    }
    return map;
  });
  const matchKeyword = keywordMatcher(params.keyword);
  const genreSet = new Set(params.genreIds);
  const filtered = [...games.map.values()].filter((g) => {
    if (matchKeyword && !matchKeyword(g.searchText)) return false;
    // ジャンル内の複数選択は OR（§4.3）
    if (genreSet.size > 0 && !genreSet.has(g.genreId ?? '')) return false;
    if (params.tagIds.length > 0 && !params.tagIds.every((id) => g.tagIds.includes(id))) return false;
    return true;
  });
  const countOf = (g: GameRecord) => counts.get(g.id) ?? { playlistCount: 0, videoCount: 0 };
  const byTitle = (a: GameRecord, b: GameRecord) => collator.compare(a.title, b.title) || (a.id < b.id ? -1 : 1);
  filtered.sort((a, b) => {
    if (params.sort === 'title') return byTitle(a, b);
    const diff = params.sort === 'videoCount' ? countOf(b).videoCount - countOf(a).videoCount : countOf(b).playlistCount - countOf(a).playlistCount;
    return diff || byTitle(a, b);
  });
  const page = paginate(filtered, params.page);
  return {
    ...page,
    items: page.items.map((g) => ({
      id: g.id,
      title: g.title,
      packageImageUrl: g.packageImageUrl,
      genreId: g.genreId,
      genreName: g.genreName,
      ...countOf(g),
      tags: resolveTags(g.tagIds, g.fixedTagIds, listed.tagsMap),
    })),
  };
}

// ---- TOP ----

/** TOP の各セクションの再生リスト（ページ top 仕様書 §6・§7・§8） */
export async function topCatalog(): Promise<TopCatalog> {
  // 人気のチャンネルの索引が用意できないときは、そのセクションだけ出さない（ページ top 仕様書 §6A.3）
  const [listed, channels] = await Promise.all([
    listedPlaylists(),
    channelIndex().catch((error: unknown): ChannelIndex => {
      console.error('[catalog] 人気のチャンネルを用意できませんでした', error);
      return { popular: [], searchTextById: new Map() };
    }),
  ]);
  // 人気のチャンネル（§6A）。チャンネル一覧の人気順の先頭20件
  const popularChannels = channels.popular
    .slice(0, TOP_CAROUSEL_LIMIT)
    .map((c): PopularChannelItem => ({ id: c.id, name: c.name, iconUrl: c.iconUrl, playlistCount: c.playlistCount }));
  const playlistSections = memo('top', listed.versions, () => {
    const picked = new Map<string, PlaylistRecord>();
    const ids = (list: PlaylistRecord[]) => list.map((r) => (picked.set(r.summary.id, r), r.summary.id));

    // 注目: スコアのあるものだけ、スコアの高い順（§6.4）
    const scored = listed.sorted.score.filter((r) => r.summary.score != null);
    const byGenre: Record<string, string[]> = {};
    const genreLists = new Map<string, PlaylistRecord[]>();
    for (const r of scored) {
      for (const genreId of r.summary.gameGenreIds) {
        const list = genreLists.get(genreId) ?? [];
        if (list.length < TOP_FEATURED_FETCH_LIMIT) list.push(r);
        genreLists.set(genreId, list);
      }
    }
    for (const [genreId, list] of genreLists) byGenre[genreId] = ids(list);
    const overall = ids(scored.slice(0, TOP_FEATURED_FETCH_LIMIT));

    // 新着: プレミテへの登録日が新しい順（§7.3）
    const newArrivals = ids([...listed.sorted.score].sort((a, b) => tieBreak(a, b)).slice(0, TOP_CAROUSEL_LIMIT));

    // タグピックアップ: 使用数の多いタグ上位6件、各タグの再生リストをスコアの高い順（スコアなしは末尾、§8.4）
    const topTags = [...listed.tagsMap.values()]
      .filter((t) => isListedTag(t, 'playlist'))
      .sort((a, b) => b.usagePlaylistCount - a.usagePlaylistCount || (a.id < b.id ? -1 : 1))
      .slice(0, TAG_PICKUP_COUNT);
    const tagPickups: TopCatalog['tagPickups'] = [];
    for (const tag of topTags) {
      const matched = listed.sorted.score.filter((r) => r.tagIds.includes(tag.id)).slice(0, TOP_CAROUSEL_LIMIT);
      if (matched.length > 0) tagPickups.push({ tagId: tag.id, tagName: tag.name, ids: ids(matched) });
    }

    return {
      playlists: [...picked.values()].map((r) => toSummary(r, listed.tagsMap)),
      featured: { overall, byGenre },
      newArrivals,
      tagPickups,
    };
  });
  return { ...playlistSections, popularChannels };
}

// ---- API Route の応答 ----

/**
 * 一覧 API の応答を作る。回数制限（lib/rate-limit.ts）を超えたときは 429（Retry-After つき）、
 * 索引が用意できないときは 503（画面は「読み込めませんでした」と再読み込みのボタンを出す）。
 */
export async function catalogResponse(request: Request, build: () => Promise<unknown>): Promise<Response> {
  const retryAfter = checkRateLimit(request.headers);
  if (retryAfter !== null) {
    return Response.json(
      { error: 'アクセスが集中しています。しばらくしてからもう一度お試しください' },
      { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'private, no-store' } },
    );
  }
  try {
    return Response.json(await build(), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[catalog] 一覧の検索に失敗しました', error);
    return Response.json({ error: '一覧を読み込めませんでした。時間をおいて再度お試しください' }, { status: 503 });
  }
}
