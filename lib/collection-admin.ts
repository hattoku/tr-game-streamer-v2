// コンテンツ収集の管理画面（/admin/collection 配下）で共用するクライアント側の読み込み・API呼び出し。
// 管理 AI運営者向け収集候補レビューUI仕様書 v2.0。exploration_channels・collection_candidates 等は
// rules で管理者の読み取りのみ許可しているため、読み込みはクライアントSDK、書き込みは API Route 経由。
import { collection, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { todayJst } from './collection-quota-shared';
import type { PopularityCounts } from './popularity-shared';

export type ExplorationChannelStatus = 'unresolved' | 'pending_confirm' | 'active' | 'excluded' | 'opted_out';

export interface ChannelCandidate {
  youtubeChannelId: string;
  title: string;
  iconUrl: string;
  subscriberCount: number | null;
}

export type PublishMode = 'confirm' | 'auto';

export interface ExplorationChannel {
  id: string;
  name: string;
  status: ExplorationChannelStatus;
  youtubeChannelId: string | null;
  channelTitle: string | null;
  channelIconUrl: string | null;
  subscriberCount: number | null;
  searchCandidates: ChannelCandidate[];
  tagIds: string[];
  publishMode: PublishMode;
  featuredOrder: number | null;
  authorizedVia: string | null;
  statusNote: string | null;
  lastSweptAt: number | null;
  lastSweepNewCount: number | null;
  createdAt: number;
}

function toMillis(value: unknown): number | null {
  return (value as { toMillis?: () => number } | null)?.toMillis?.() ?? null;
}

export async function fetchExplorationChannels(): Promise<ExplorationChannel[]> {
  const snap = await getDocs(collection(db, 'exploration_channels'));
  return snap.docs
    .map((d): ExplorationChannel => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name ?? '',
        status: data.status ?? 'unresolved',
        youtubeChannelId: data.youtubeChannelId ?? null,
        channelTitle: data.channelTitle ?? null,
        channelIconUrl: data.channelIconUrl ?? null,
        subscriberCount: data.subscriberCount ?? null,
        searchCandidates: data.searchCandidates ?? [],
        tagIds: data.tagIds ?? [],
        publishMode: data.publishMode === 'auto' ? 'auto' : 'confirm',
        featuredOrder: typeof data.featuredOrder === 'number' ? data.featuredOrder : null,
        authorizedVia: data.authorizedVia ?? null,
        statusNote: data.statusNote ?? null,
        lastSweptAt: toMillis(data.lastSweptAt) ?? toMillis(data.lastExploredAt),
        lastSweepNewCount: data.lastSweepNewCount ?? data.lastFoundCount ?? null,
        createdAt: toMillis(data.createdAt) ?? 0,
      };
    })
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** 掲載状態（`playlists.listingStatus`）。lib/listing.ts と同じ値 */
export type ListingTab = 'unconfirmed' | 'listed' | 'non_game' | 'excluded' | 'too_short' | 'channel_off';

export interface ListingPlaylist {
  id: string;
  title: string;
  thumbnailUrl: string;
  channelName: string;
  explorationChannelId: string;
  videoCount: number;
  playlistPublishedAt: number | null;
  registeredAt: number | null;
  gameId: string | null;
  gameName: string;
  gameHint: string;
  listingStatus: string;
  listingReason: string | null;
  listingSetBy: string | null;
  listingSetAt: number | null;
  hasVideos: boolean;
  tagIds: string[];
}

const LIST_LIMIT = 1000;

/** 掲載状態ごとの再生リスト（管理者は isPublic が false のものも読める）。新しく取り込んだ順 */
export async function fetchListingPlaylists(status: ListingTab, explorationChannelId?: string): Promise<ListingPlaylist[]> {
  const constraints = [where('listingStatus', '==', status), ...(explorationChannelId ? [where('explorationChannelId', '==', explorationChannelId)] : []), limit(LIST_LIMIT)];
  const snap = await getDocs(query(collection(db, 'playlists'), ...constraints));
  return snap.docs
    .map((d): ListingPlaylist => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title ?? '',
        thumbnailUrl: data.thumbnailUrl ?? '',
        channelName: data.channelName ?? '',
        explorationChannelId: data.explorationChannelId ?? '',
        videoCount: data.videoCount ?? 0,
        playlistPublishedAt: toMillis(data.playlistPublishedAt),
        registeredAt: toMillis(data.registeredAt),
        gameId: data.gameId ?? null,
        gameName: data.gameName ?? '',
        gameHint: data.gameHint ?? '',
        listingStatus: data.listingStatus ?? 'listed',
        listingReason: data.listingReason ?? null,
        listingSetBy: data.listingSetBy ?? null,
        listingSetAt: toMillis(data.listingSetAt),
        hasVideos: data.youtubeItemCount != null,
        tagIds: data.playlistTagIds ?? [],
      };
    })
    .sort((a, b) => (b.playlistPublishedAt ?? b.registeredAt ?? 0) - (a.playlistPublishedAt ?? a.registeredAt ?? 0));
}

/** 掲載状態ごとの件数（チャンネルで絞ることもできる） */
export async function countListing(status: ListingTab, explorationChannelId?: string): Promise<number> {
  const constraints = [where('listingStatus', '==', status), ...(explorationChannelId ? [where('explorationChannelId', '==', explorationChannelId)] : [])];
  return (await getCountFromServer(query(collection(db, 'playlists'), ...constraints))).data().count;
}

export interface ListingRulesDoc {
  excludedWords: string[];
  nonGameWords: string[];
  minVideoCount: number;
}

export async function fetchCollectionQuotaUsedToday(): Promise<number> {
  const snap = await getDoc(doc(db, 'collection_quota_logs', todayJst()));
  return (snap.data()?.quotaConsumed as number | undefined) ?? 0;
}

export interface CollectionBatchLog {
  executedAt: number;
  trigger: 'manual' | 'cron';
  processedChannels: number;
  candidatesFound: number;
  status: string;
}

/** 直近の巡回（手動の巡回と、毎日の新着動画の再取得に含まれる巡回のうち新しい方） */
export async function fetchLastCollectionBatch(): Promise<CollectionBatchLog | null> {
  const [manualSnap, dailySnap] = await Promise.all([
    getDocs(query(collection(db, 'collection_batch_logs'), orderBy('executedAt', 'desc'), limit(1))),
    getDocs(query(collection(db, 'batch_logs'), orderBy('executedAt', 'desc'), limit(1))),
  ]);
  const manual = manualSnap.docs[0]?.data();
  const daily = dailySnap.docs[0]?.data();
  const manualAt = toMillis(manual?.executedAt) ?? 0;
  const dailyAt = toMillis(daily?.executedAt) ?? 0;
  if (daily && dailyAt >= manualAt && daily.sweptChannelCount != null) {
    const counts = (daily.sweepNewPlaylists ?? {}) as Record<string, number>;
    return {
      executedAt: dailyAt,
      trigger: 'cron',
      processedChannels: daily.sweptChannelCount ?? 0,
      candidatesFound: Object.values(counts).reduce((a, b) => a + b, 0),
      status: daily.status ?? '',
    };
  }
  if (!manual) return null;
  return {
    executedAt: manualAt,
    trigger: manual.trigger === 'cron' ? 'cron' : 'manual',
    processedChannels: manual.processedChannels ?? 0,
    candidatesFound: manual.candidatesFound ?? 0,
    status: manual.status ?? '',
  };
}

/** 管理者のIDトークンを付けて管理APIを POST で呼ぶ。レスポンスの JSON とステータスを返す */
export async function postAdminApi<T = Record<string, unknown>>(path: string, body: unknown): Promise<{ ok: boolean; status: number; body: T }> {
  const idToken = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, body: json };
}

/** 人気の数字（共通 人気のチャンネル 集計 仕様書 §6）。channels は YouTube のチャンネルID → 人数 */
export interface PopularityOverview {
  lastRunAt: number | null;
  channels: Record<string, PopularityCounts>;
}

export async function fetchPopularityOverview(): Promise<PopularityOverview> {
  const idToken = await auth.currentUser?.getIdToken();
  const res = await fetch('/api/admin/popularity', { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return (await res.json()) as PopularityOverview;
}

/** クォータ超過（429）のときのメッセージ */
export function quotaExceededMessage(remaining: unknown): string {
  return `今日のYouTube APIの枠が足りません（残り ${typeof remaining === 'number' ? remaining : 0} ユニット）。明日以降に実行してください`;
}

export function formatDateTime(ms: number | null): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatSubscribers(count: number | null): string {
  if (count === null) return '登録者数 非公開';
  if (count >= 10000) return `登録者 ${(count / 10000).toFixed(count >= 100000 ? 0 : 1)}万人`;
  return `登録者 ${count.toLocaleString('ja-JP')}人`;
}
