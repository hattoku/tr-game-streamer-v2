// コンテンツ収集の管理画面（/admin/collection 配下）で共用するクライアント側の読み込み・API呼び出し。
// 管理 AI運営者向け収集候補レビューUI仕様書 v2.0。exploration_channels・collection_candidates 等は
// rules で管理者の読み取りのみ許可しているため、読み込みはクライアントSDK、書き込みは API Route 経由。
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { todayJst } from './collection-quota-shared';

export type ExplorationChannelStatus = 'unresolved' | 'pending_confirm' | 'active' | 'excluded';

export interface ChannelCandidate {
  youtubeChannelId: string;
  title: string;
  iconUrl: string;
  subscriberCount: number | null;
}

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
  lastExploredAt: number | null;
  lastFoundCount: number | null;
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
        lastExploredAt: toMillis(data.lastExploredAt),
        lastFoundCount: data.lastFoundCount ?? null,
        createdAt: toMillis(data.createdAt) ?? 0,
      };
    })
    .sort((a, b) => a.createdAt - b.createdAt);
}

export type CandidateStatus = 'pending' | 'registered' | 'rejected';

/** 承認前に楽天ブックスを検索した結果（収集候補レビューUI仕様書 v2.2 §3.7）。lib/collection-game.ts の RakutenPick と同じ形 */
export interface RakutenPick {
  jan: string;
  title: string;
  hardware: string;
  imageUrl: string;
  salesDate: string;
}

export interface RakutenSearchResult {
  /** 検索したときのゲーム名 */
  title: string;
  /** 実際に結果が出た検索語（0件のときは短くして探し直すため、ゲーム名と違うことがある） */
  query: string;
  items: RakutenPick[];
}

export interface CollectionCandidate {
  id: string;
  playlistTitle: string;
  channelId: string;
  channelTitle: string;
  explorationChannelId: string;
  thumbnailUrl: string;
  videoCount: number;
  playlistPublishedAt: number | null;
  guessedGameId: string | null;
  gameQuery: string;
  titleTagIds: string[];
  status: CandidateStatus;
  reviewComment: string | null;
  rakutenSearch: RakutenSearchResult | null;
}

export async function fetchCandidates(status: CandidateStatus): Promise<CollectionCandidate[]> {
  const snap = await getDocs(query(collection(db, 'collection_candidates'), where('status', '==', status)));
  return snap.docs
    .map((d): CollectionCandidate => {
      const data = d.data();
      return {
        id: d.id,
        playlistTitle: data.playlistTitle ?? '',
        channelId: data.channelId ?? '',
        channelTitle: data.channelTitle ?? '',
        explorationChannelId: data.explorationChannelId ?? '',
        thumbnailUrl: data.thumbnailUrl ?? '',
        videoCount: data.videoCount ?? 0,
        playlistPublishedAt: toMillis(data.playlistPublishedAt),
        guessedGameId: data.guessedGameId ?? null,
        gameQuery: data.gameQuery ?? '',
        titleTagIds: data.titleTagIds ?? [],
        status: data.status ?? 'pending',
        reviewComment: data.reviewComment ?? null,
        rakutenSearch: data.rakutenSearch
          ? { title: data.rakutenSearch.title ?? '', query: data.rakutenSearch.query ?? '', items: data.rakutenSearch.items ?? [] }
          : null,
      };
    })
    .sort((a, b) => (b.playlistPublishedAt ?? 0) - (a.playlistPublishedAt ?? 0));
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

export async function fetchLastCollectionBatch(): Promise<CollectionBatchLog | null> {
  const snap = await getDocs(query(collection(db, 'collection_batch_logs'), orderBy('executedAt', 'desc'), limit(1)));
  const data = snap.docs[0]?.data();
  if (!data) return null;
  return {
    executedAt: toMillis(data.executedAt) ?? 0,
    trigger: data.trigger === 'cron' ? 'cron' : 'manual',
    processedChannels: data.processedChannels ?? 0,
    candidatesFound: data.candidatesFound ?? 0,
    status: data.status ?? '',
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
