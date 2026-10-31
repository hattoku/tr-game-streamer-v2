// YouTube Data API v3 連携基盤（サーバー専用）。
//
// 再生リスト登録フロー（管理者専用）と、将来の新着動画取得（手動トリガー版）の
// 両方から利用する共通クライアント。フェーズ2では「プレイリスト/チャンネル/動画の
// snippet取得ができればよい」（wiki/sources/2026-09-10-phase2-plan.md）というスコープに
// 絞り、googleapisパッケージは追加せずREST APIをfetchで直接呼び出す。
//
// 呼び出し元はNext.js API Route等のサーバーサイドコードに限定すること
// （YOUTUBE_API_KEYをブラウザに露出させないため）。
import { AsyncLocalStorage } from 'node:async_hooks';
import { YOUTUBE_API_KEY } from './constants';

const API_BASE = 'https://www.googleapis.com/youtube/v3';

export class YouTubeApiError extends Error {
  status?: number;
  reason?: string;

  constructor(message: string, status?: number, reason?: string) {
    super(message);
    this.name = 'YouTubeApiError';
    this.status = status;
    this.reason = reason;
  }
}

type Thumbnails = Record<string, { url: string } | undefined>;

function bestThumbnailUrl(thumbnails: Thumbnails | undefined): string {
  const order = ['maxres', 'high', 'medium', 'default'] as const;
  for (const key of order) {
    const url = thumbnails?.[key]?.url;
    if (url) return url;
  }
  return '';
}

// 定期取得バッチ（新着動画自動検知）のクォータ消費記録用カウンタ。
// list系エンドポイント（playlists/channels/playlistItems/videos）は1ユニット、search.list は
// 100ユニットとして加算する（ENDPOINT_COST）。resetQuotaCounter()/getQuotaConsumed()で1バッチ分を集計する想定
// （batch_logs.quotaConsumed。Firestore データモデル設計書 3.21節）。
// 同時に走るリクエスト（探索の定期実行と手動操作など）で数が混ざらないよう、resetQuotaCounter() は
// 呼び出し元の非同期コンテキストに専用のカウンタを置く（AsyncLocalStorage.enterWith）。
const quotaStorage = new AsyncLocalStorage<{ count: number }>();

export function resetQuotaCounter(): void {
  quotaStorage.enterWith({ count: 0 });
}

export function getQuotaConsumed(): number {
  return quotaStorage.getStore()?.count ?? 0;
}

// search.list だけは1回100ユニット（他のlist系は1ユニット）。AI運営者_YouTube API調査レポート §2
const ENDPOINT_COST: Record<string, number> = { search: 100 };

async function callApi<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  if (!YOUTUBE_API_KEY) {
    throw new YouTubeApiError('YOUTUBE_API_KEY が設定されていません（.env.local参照）。');
  }
  const url = new URL(`${API_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries({ ...params, key: YOUTUBE_API_KEY })) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url);
  const quotaStore = quotaStorage.getStore();
  if (quotaStore) quotaStore.count += ENDPOINT_COST[endpoint] ?? 1;
  const body = await res.json();
  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason;
    throw new YouTubeApiError(
      body?.error?.message ?? `YouTube API error (${res.status})`,
      res.status,
      reason,
    );
  }
  return body as T;
}

/**
 * ページ送りを続けるかどうか。YouTube は再生リストによって、0件のページと同じ nextPageToken を
 * 返し続けることがある（例: playlistItems で総数12件の再生リストが、11件の後に空ページを無限に返す）。
 * そのまま続けると処理が終わらずクォータを使い続けるため、空ページ・同じトークン・上限ページ数で打ち切る。
 */
const MAX_PAGES = 100;

function nextPageTokenOrStop(prevToken: string | undefined, nextToken: string | undefined, pageItemCount: number, pageCount: number): string | undefined {
  if (!nextToken || pageItemCount === 0 || nextToken === prevToken || pageCount >= MAX_PAGES) return undefined;
  return nextToken;
}

export interface PlaylistSnippet {
  youtubePlaylistId: string;
  title: string;
  thumbnailUrl: string;
  channelId: string;
  itemCount: number;
  isPublic: boolean;
}

export interface ChannelSnippet {
  youtubeChannelId: string;
  name: string;
  iconUrl: string;
}

export interface PlaylistItemSnippet {
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string;
  position: number;
  publishedAt: string;
}

/** 再生リストURLからYouTube再生リストID（`list`クエリパラメータ）を抽出する。見つからなければnull。 */
export function extractPlaylistId(url: string): string | null {
  try {
    return new URL(url).searchParams.get('list');
  } catch {
    return null;
  }
}

/** 再生リストの基本情報を取得する。存在しない・非公開の場合はnullを返す。 */
export async function fetchPlaylistSnippet(playlistId: string): Promise<PlaylistSnippet | null> {
  const data = await callApi<{
    items: Array<{
      id: string;
      snippet: { title: string; thumbnails: Thumbnails; channelId: string };
      contentDetails: { itemCount: number };
      status: { privacyStatus: string };
    }>;
  }>('playlists', {
    part: 'snippet,contentDetails,status',
    id: playlistId,
  });

  const item = data.items[0];
  if (!item) return null;

  return {
    youtubePlaylistId: item.id,
    title: item.snippet.title,
    thumbnailUrl: bestThumbnailUrl(item.snippet.thumbnails),
    channelId: item.snippet.channelId,
    itemCount: item.contentDetails.itemCount,
    isPublic: item.status.privacyStatus === 'public',
  };
}

/** チャンネルの基本情報を取得する。存在しない場合はnullを返す。 */
export async function fetchChannelSnippet(channelId: string): Promise<ChannelSnippet | null> {
  const data = await callApi<{
    items: Array<{ id: string; snippet: { title: string; thumbnails: Thumbnails } }>;
  }>('channels', {
    part: 'snippet',
    id: channelId,
  });

  const item = data.items[0];
  if (!item) return null;

  return {
    youtubeChannelId: item.id,
    name: item.snippet.title,
    iconUrl: bestThumbnailUrl(item.snippet.thumbnails),
  };
}

/** 再生リストに含まれる全動画のsnippetを取得する（ページネーション込み）。 */
export async function fetchPlaylistItems(playlistId: string): Promise<PlaylistItemSnippet[]> {
  const items: PlaylistItemSnippet[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const data = await callApi<{
      items: Array<{
        snippet: {
          title: string;
          thumbnails: Thumbnails;
          position: number;
          publishedAt: string;
          resourceId: { videoId: string };
        };
      }>;
      nextPageToken?: string;
    }>('playlistItems', {
      part: 'snippet',
      playlistId,
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });

    for (const item of data.items) {
      items.push({
        youtubeVideoId: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        thumbnailUrl: bestThumbnailUrl(item.snippet.thumbnails),
        position: item.snippet.position,
        publishedAt: item.snippet.publishedAt,
      });
    }
    pageToken = nextPageTokenOrStop(pageToken, data.nextPageToken, data.items.length, ++pageCount);
  } while (pageToken);

  return items;
}

function parseIso8601DurationToSeconds(duration: string): number | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match) return null;
  const [, h, m, s] = match;
  return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
}

/** 動画IDのリストから動画の長さ（秒）を取得する。videos.listのid上限（50件）ごとに分割して呼び出す。 */
export async function fetchVideoDurations(videoIds: string[]): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  if (videoIds.length === 0) return result;

  const CHUNK_SIZE = 50;
  for (let i = 0; i < videoIds.length; i += CHUNK_SIZE) {
    const chunk = videoIds.slice(i, i + CHUNK_SIZE);
    const data = await callApi<{
      items: Array<{ id: string; contentDetails: { duration: string } }>;
    }>('videos', {
      part: 'contentDetails',
      id: chunk.join(','),
    });
    for (const item of data.items) {
      result.set(item.id, parseIso8601DurationToSeconds(item.contentDetails.duration));
    }
  }
  return result;
}

// ---- コンテンツ収集（チャンネル起点の再生リスト探索）用 ----
// 管理_Ai運営者 コンテンツ収集機能仕様書 v3.0 §3

export interface ChannelPlaylist {
  youtubePlaylistId: string;
  title: string;
  thumbnailUrl: string;
  channelId: string;
  channelTitle: string;
  itemCount: number;
  isPublic: boolean;
  publishedAt: string | null;
}

/** チャンネルの再生リストを全件取得する（playlists.list の channelId 指定、50件ごとに1ユニット。§3.2） */
export async function fetchChannelPlaylists(channelId: string): Promise<ChannelPlaylist[]> {
  const playlists: ChannelPlaylist[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const data = await callApi<{
      items: Array<{
        id: string;
        snippet: { title: string; thumbnails: Thumbnails; channelId: string; channelTitle: string; publishedAt?: string };
        contentDetails: { itemCount: number };
        status: { privacyStatus: string };
      }>;
      nextPageToken?: string;
    }>('playlists', {
      part: 'snippet,contentDetails,status',
      channelId,
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });

    for (const item of data.items) {
      playlists.push({
        youtubePlaylistId: item.id,
        title: item.snippet.title,
        thumbnailUrl: bestThumbnailUrl(item.snippet.thumbnails),
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
        itemCount: item.contentDetails.itemCount,
        isPublic: item.status.privacyStatus === 'public',
        publishedAt: item.snippet.publishedAt ?? null,
      });
    }
    pageToken = nextPageTokenOrStop(pageToken, data.nextPageToken, data.items.length, ++pageCount);
  } while (pageToken);

  return playlists;
}

export interface ChannelDetail {
  youtubeChannelId: string;
  title: string;
  iconUrl: string;
  /** 登録者数を非公開にしているチャンネルは null */
  subscriberCount: number | null;
}

type ChannelsListResponse = {
  items?: Array<{
    id: string;
    snippet: { title: string; thumbnails: Thumbnails };
    statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
  }>;
};

function toChannelDetail(item: NonNullable<ChannelsListResponse['items']>[number]): ChannelDetail {
  const hidden = item.statistics?.hiddenSubscriberCount;
  const count = item.statistics?.subscriberCount;
  return {
    youtubeChannelId: item.id,
    title: item.snippet.title,
    iconUrl: bestThumbnailUrl(item.snippet.thumbnails),
    subscriberCount: !hidden && count ? Number(count) : null,
  };
}

/** チャンネルIDのリストから詳細（名前・アイコン・登録者数）を取得する。50件まで1ユニット */
export async function fetchChannelDetails(channelIds: string[]): Promise<ChannelDetail[]> {
  if (channelIds.length === 0) return [];
  const data = await callApi<ChannelsListResponse>('channels', {
    part: 'snippet,statistics',
    id: channelIds.slice(0, 50).join(','),
  });
  const byId = new Map((data.items ?? []).map((item) => [item.id, toChannelDetail(item)]));
  // 入力順（search.list の関連度順）を保つ
  return channelIds.map((id) => byId.get(id)).filter((d): d is ChannelDetail => !!d);
}

/**
 * チャンネル名で検索し、候補を最大5件返す（search.list type=channel、100ユニット＋channels.list 1ユニット。§3.1）。
 */
export async function searchChannelsByName(name: string): Promise<ChannelDetail[]> {
  const data = await callApi<{ items?: Array<{ id: { channelId?: string } }> }>('search', {
    part: 'snippet',
    type: 'channel',
    q: name,
    maxResults: '5',
    regionCode: 'JP',
    relevanceLanguage: 'ja',
  });
  const ids = (data.items ?? []).map((i) => i.id.channelId).filter((id): id is string => !!id);
  return fetchChannelDetails(ids);
}

export type ChannelRef = { kind: 'handle'; value: string } | { kind: 'id'; value: string };

/**
 * チャンネルURL・@ハンドル・チャンネルID（UC...）を解釈する。どれにも当たらなければ null（名前として扱う）。
 * 受け付ける形: https://www.youtube.com/@handle、https://www.youtube.com/channel/UC...、@handle、UC...
 */
export function parseChannelRef(input: string): ChannelRef | null {
  const text = input.trim();
  if (!text) return null;
  if (/^UC[\w-]{22}$/.test(text)) return { kind: 'id', value: text };
  if (/^@[^\s/]+$/.test(text)) return { kind: 'handle', value: text };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0]?.startsWith('@')) return { kind: 'handle', value: decodeURIComponent(segments[0]) };
  if (segments[0] === 'channel' && segments[1] && /^UC[\w-]{22}$/.test(segments[1])) return { kind: 'id', value: segments[1] };
  return null;
}

/** parseChannelRef の結果からチャンネルを特定する（channels.list、1ユニット）。見つからなければ null */
export async function resolveChannelRef(ref: ChannelRef): Promise<ChannelDetail | null> {
  const data = await callApi<ChannelsListResponse>('channels', {
    part: 'snippet,statistics',
    ...(ref.kind === 'handle' ? { forHandle: ref.value } : { id: ref.value }),
  });
  const item = data.items?.[0];
  return item ? toChannelDetail(item) : null;
}
