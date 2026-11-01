// 新着動画の取得（動画更新バッチ）の本体（サーバー専用）。共通 YouTube定期取得仕様書 §7。
// 全公開再生リストの動画数を playlists.list（50件ごとに1ユニット）でまとめて確認し、前回確認した数
// （playlists.youtubeItemCount）と違う再生リストだけ playlistItems.list で動画一覧を取り直す。
// 以前は全件を毎日全ページ取り直していて、カタログを数千件にすると1日の上限に届くため差分にした。
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import {
  fetchPlaylistItemCounts,
  fetchPlaylistItems,
  fetchVideoDurations,
  getQuotaConsumed,
  YouTubeApiError,
  type PlaylistItemCount,
} from './youtube';

/** 1回の実行で使うクォータの上限（コンテンツ収集の1日の上限 6,000 の残り。§7.3） */
export const NEW_VIDEOS_QUOTA_BUDGET = 4000;

/** batch_logs に残す一覧の最大件数（ドキュメントの大きさを抑える） */
const LOG_LIST_LIMIT = 100;

const COUNT_CHUNK_SIZE = 50;
const WRITE_CHUNK_SIZE = 400;

export interface NewVideoDetail {
  playlistId: string;
  title: string;
  newVideos: number;
}

export interface PlaylistRef {
  playlistId: string;
  title: string;
}

export interface RefreshSummary {
  /** 確認した公開再生リストの数 */
  playlistsChecked: number;
  /** 動画数が変わって動画一覧を取り直した数 */
  playlistsRefetched: number;
  playlistsWithNewVideos: number;
  totalNewVideos: number;
  notificationsCreated: number;
  /** クォータの上限で後回しにした数（次の回に取り直す） */
  deferredCount: number;
  /** YouTube の1日のクォータが途中で尽きた */
  quotaExceeded: boolean;
  newVideoDetails: NewVideoDetail[];
  notFoundPlaylists: PlaylistRef[];
  errors: Array<PlaylistRef & { message: string }>;
  quotaConsumed: number;
}

function errorMessage(e: unknown): string {
  return e instanceof YouTubeApiError ? e.message : e instanceof Error ? e.message : 'unknown_error';
}

/** 取り直しに要る見込みのユニット数（playlistItems.list の全ページ＋余分の1ページ＋新着分の videos.list） */
function estimateRefetchCost(itemCount: number): number {
  return Math.ceil(itemCount / 50) + 2;
}

/** YouTube の1日のクォータが尽きた（以降の呼び出しは全部失敗する。§6.2・§7.3） */
function isQuotaExceeded(e: unknown): boolean {
  return e instanceof YouTubeApiError && (e.reason === 'quotaExceeded' || e.reason === 'dailyLimitExceeded');
}

async function refetchPlaylist(
  playlistDoc: QueryDocumentSnapshot,
  youtube: PlaylistItemCount,
): Promise<{ newVideos: number; notifications: number }> {
  const playlistId = playlistDoc.id;
  const playlist = playlistDoc.data();
  const items = await fetchPlaylistItems(playlistId);

  const existingSnap = await adminDb.collection('videos').where('playlistId', '==', playlistId).get();
  const existingIds = new Set(existingSnap.docs.map((d) => d.data().youtubeVideoId));
  const newItems = items.filter((i) => !existingIds.has(i.youtubeVideoId));

  const durations = await fetchVideoDurations(newItems.map((i) => i.youtubeVideoId));
  for (let start = 0; start < newItems.length; start += WRITE_CHUNK_SIZE) {
    const batch = adminDb.batch();
    for (const item of newItems.slice(start, start + WRITE_CHUNK_SIZE)) {
      batch.set(adminDb.collection('videos').doc(`${playlistId}_${item.youtubeVideoId}`), {
        youtubeVideoId: item.youtubeVideoId,
        playlistId,
        position: item.position,
        title: item.title,
        thumbnailUrl: item.thumbnailUrl,
        durationSeconds: durations.get(item.youtubeVideoId) ?? null,
        publishedAt: new Date(item.publishedAt),
        playStartCount: 0,
      });
    }
    await batch.commit();
  }

  // 新着通知（ユーザー通知機能仕様書「シリーズ新着通知」）
  let notifications = 0;
  if (newItems.length > 0) {
    const mylistSnap = await adminDb.collection('mylist').where('playlistId', '==', playlistId).get();
    for (let start = 0; start < mylistSnap.docs.length; start += WRITE_CHUNK_SIZE) {
      const batch = adminDb.batch();
      for (const mylistDoc of mylistSnap.docs.slice(start, start + WRITE_CHUNK_SIZE)) {
        batch.set(adminDb.collection('notifications').doc(), {
          userId: mylistDoc.data().userId,
          type: 'series_new_episode',
          playlistId,
          playlistTitle: playlist.title,
          message: `「${playlist.title}」に新しい動画が追加されました`,
          isRead: false,
          createdAt: new Date(),
        });
        notifications++;
      }
      await batch.commit();
    }
  }

  // youtubeItemCount は最後に書く。途中で失敗したら記録が古いままなので、次の回にもう一度取り直す（§7.2）
  const update: Record<string, unknown> = {
    videoCount: items.length,
    youtubeItemCount: youtube.itemCount,
    lastFetchedAt: new Date(),
  };
  // 新着分ではなく取り直した全件から決める（前回が動画の保存後に失敗していても、ここで追いつく）
  if (items.length > 0) {
    const latest = items.reduce((l, i) => (i.publishedAt > l ? i.publishedAt : l), items[0].publishedAt);
    const current = playlist.latestVideoPublishedAt?.toDate?.() as Date | undefined;
    if (!current || new Date(latest) > current) update.latestVideoPublishedAt = new Date(latest);
  }
  await playlistDoc.ref.update(update);

  return { newVideos: newItems.length, notifications };
}

/**
 * 全公開再生リストの新着を確認する。Firestore の想定外のエラーは呼び出し元へ投げる。
 * クォータの数え始め（resetQuotaCounter）は呼び出し元で行う（エラー時もそこまでの消費をログに残すため）。
 */
export async function refreshNewVideos(): Promise<RefreshSummary> {
  const playlistsSnap = await adminDb.collection('playlists').where('isPublic', '==', true).get();
  const docs = playlistsSnap.docs;

  const summary: RefreshSummary = {
    playlistsChecked: 0,
    playlistsRefetched: 0,
    playlistsWithNewVideos: 0,
    totalNewVideos: 0,
    notificationsCreated: 0,
    deferredCount: 0,
    quotaExceeded: false,
    newVideoDetails: [],
    notFoundPlaylists: [],
    errors: [],
    quotaConsumed: 0,
  };
  const titleOf = (d: QueryDocumentSnapshot) => (d.data().title as string) ?? d.id;

  // ① 動画数の確認（50件ずつ。失敗したまとまりはエラーとして残し、次の回に回す）
  const counts = new Map<string, PlaylistItemCount>();
  const checked: QueryDocumentSnapshot[] = [];
  for (let i = 0; i < docs.length; i += COUNT_CHUNK_SIZE) {
    const chunk = docs.slice(i, i + COUNT_CHUNK_SIZE);
    try {
      const result = await fetchPlaylistItemCounts(chunk.map((d) => d.id));
      result.forEach((v, k) => counts.set(k, v));
      checked.push(...chunk);
    } catch (e) {
      const message = `動画数の確認に失敗: ${errorMessage(e)}`;
      const failed = isQuotaExceeded(e) ? docs.slice(i) : chunk;
      for (const d of failed) summary.errors.push({ playlistId: d.id, title: titleOf(d), message });
      if (isQuotaExceeded(e)) {
        summary.quotaExceeded = true;
        break;
      }
    }
  }
  summary.playlistsChecked = checked.length;

  // ② 振り分け
  const changed: Array<{ doc: QueryDocumentSnapshot; youtube: PlaylistItemCount }> = [];
  for (const d of checked) {
    const youtube = counts.get(d.id);
    if (!youtube || !youtube.isPublic) {
      summary.notFoundPlaylists.push({ playlistId: d.id, title: titleOf(d) });
      continue;
    }
    if (d.data().youtubeItemCount !== youtube.itemCount) changed.push({ doc: d, youtube });
  }

  // ③ 取り直し（1回あたりの上限を超えそうなら、またはクォータが尽きたら残りは後回し。§7.3）
  for (const { doc, youtube } of changed) {
    if (summary.quotaExceeded || getQuotaConsumed() + estimateRefetchCost(youtube.itemCount) > NEW_VIDEOS_QUOTA_BUDGET) {
      summary.deferredCount++;
      continue;
    }
    let result;
    try {
      result = await refetchPlaylist(doc, youtube);
    } catch (e) {
      if (!(e instanceof YouTubeApiError)) throw e;
      if (isQuotaExceeded(e)) {
        summary.quotaExceeded = true;
        summary.deferredCount++;
        continue;
      }
      summary.errors.push({ playlistId: doc.id, title: titleOf(doc), message: `取り直しに失敗: ${errorMessage(e)}` });
      continue;
    }
    summary.playlistsRefetched++;
    summary.notificationsCreated += result.notifications;
    if (result.newVideos > 0) {
      summary.playlistsWithNewVideos++;
      summary.totalNewVideos += result.newVideos;
      summary.newVideoDetails.push({ playlistId: doc.id, title: titleOf(doc), newVideos: result.newVideos });
    }
  }

  summary.newVideoDetails.sort((a, b) => b.newVideos - a.newVideos);
  summary.quotaConsumed = getQuotaConsumed();
  return summary;
}

/** batch_logs に残す形（一覧は最大100件） */
export function toBatchLogFields(summary: RefreshSummary) {
  return {
    processedCount: summary.playlistsChecked,
    newVideoCount: summary.totalNewVideos,
    refetchedCount: summary.playlistsRefetched,
    deferredCount: summary.deferredCount,
    quotaExceeded: summary.quotaExceeded,
    newVideoDetails: summary.newVideoDetails.slice(0, LOG_LIST_LIMIT),
    notFoundPlaylists: summary.notFoundPlaylists.slice(0, LOG_LIST_LIMIT),
    errorPlaylists: summary.errors.slice(0, LOG_LIST_LIMIT),
    quotaConsumed: summary.quotaConsumed,
  };
}
