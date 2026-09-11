// YouTube Data API v3 連携基盤（サーバー専用）。
//
// 再生リスト登録フロー（管理者専用）と、将来の新着動画取得（手動トリガー版）の
// 両方から利用する共通クライアント。フェーズ2では「プレイリスト/チャンネル/動画の
// snippet取得ができればよい」（wiki/sources/2026-09-10-phase2-plan.md）というスコープに
// 絞り、googleapisパッケージは追加せずREST APIをfetchで直接呼び出す。
//
// 呼び出し元はNext.js API Route等のサーバーサイドコードに限定すること
// （YOUTUBE_API_KEYをブラウザに露出させないため）。
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

async function callApi<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  if (!YOUTUBE_API_KEY) {
    throw new YouTubeApiError('YOUTUBE_API_KEY が設定されていません（.env.local参照）。');
  }
  const url = new URL(`${API_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries({ ...params, key: YOUTUBE_API_KEY })) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url);
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
    pageToken = data.nextPageToken;
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
