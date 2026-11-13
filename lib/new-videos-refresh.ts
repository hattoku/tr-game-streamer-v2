// 新着動画の取得・掲載チャンネルの巡回（動画更新バッチ）の本体（サーバー専用）。共通 YouTube定期取得仕様書 §7・§8.6。
// ① 掲載チャンネルを巡回して新しい再生リストを取り込む ② 監視の対象の動画数を確認する
// ③ 動画数が変わった再生リストの動画一覧を取り直す ④ 30日（25日）を過ぎる前に全件を取り直す
// ⑤ 「自動で掲載する予定」の再生リストを掲載する ⑥ 30日ルールの消し込み。
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { fetchPlaylistItemCounts, getQuotaConsumed, YouTubeApiError, type PlaylistItemCount } from './youtube';
import { fetchAndStoreAllVideos, estimateVideoFetchCost } from './playlist-videos';
import {
  activeChannelsForSweep,
  emptyNewCounts,
  isQuotaExceededError,
  listAutoPending,
  loadGamesForSweep,
  loadListingRules,
  sweepChannel,
  type NewPlaylistCounts,
} from './channel-sweep';
import { metaAgeBase, purgeStalePlaylists, REFETCH_AFTER_DAYS, videosAgeBase } from './data-retention';

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
  /** 巡回した掲載チャンネルの数 */
  sweptChannelCount: number;
  sweepNewPlaylists: NewPlaylistCounts;
  sweepErrors: Array<{ explorationChannelId: string; message: string }>;
  /** 30日の取り直しで動画一覧を全件取り直した数 */
  fullRefetchedCount: number;
  autoListedCount: number;
  purgedCount: number;
}

function errorMessage(e: unknown): string {
  return e instanceof YouTubeApiError ? e.message : e instanceof Error ? e.message : 'unknown_error';
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** 新着通知に持たせる新しい動画タイトルの数（表示は先頭1本＋「ほかN本」。残りは将来の表示用の余裕） */
const NEW_VIDEO_TITLES_LIMIT = 5;

/** YouTube の1日のクォータが尽きた（以降の呼び出しは全部失敗する。§6.2・§7.3） */
function isQuotaExceeded(e: unknown): boolean {
  return e instanceof YouTubeApiError && (e.reason === 'quotaExceeded' || e.reason === 'dailyLimitExceeded');
}

/** 動画一覧を取り直す（全件。既存の動画も更新する）。初めて取るとき（youtubeItemCount が null）は新着通知を作らない */
async function refetchPlaylist(
  playlistDoc: QueryDocumentSnapshot,
  youtubeItemCount: number,
): Promise<{ newVideos: number; notifications: number }> {
  const playlistId = playlistDoc.id;
  const playlist = playlistDoc.data();
  const isFirstFetch = playlist.youtubeItemCount == null;
  const stored = await fetchAndStoreAllVideos(playlistId);

  // 新着通知（ユーザー通知機能仕様書「シリーズ新着通知」）
  let notifications = 0;
  const newVideos = isFirstFetch ? 0 : stored.newCount;
  if (newVideos > 0) {
    // どの動画が増えたかと、どの配信者の再生リストかを通知に持たせる（同じ名前の再生リストが別の配信者にもあるため）。
    // 動画のサムネイルはネタバレになりうるので持たせない（ユーザー通知機能仕様書 §2.1 シリーズ新着通知）
    const newVideoTitles = stored.newItems.slice(0, NEW_VIDEO_TITLES_LIMIT).map((i) => i.title);
    const mylistSnap = await adminDb.collection('mylist').where('playlistId', '==', playlistId).get();
    for (let start = 0; start < mylistSnap.docs.length; start += WRITE_CHUNK_SIZE) {
      const batch = adminDb.batch();
      for (const mylistDoc of mylistSnap.docs.slice(start, start + WRITE_CHUNK_SIZE)) {
        batch.set(adminDb.collection('notifications').doc(), {
          userId: mylistDoc.data().userId,
          type: 'series_new_episode',
          playlistId,
          playlistTitle: playlist.title,
          channelName: (playlist.channelName as string | undefined) ?? '',
          channelIconUrl: (playlist.channelIconUrl as string | undefined) ?? '',
          newVideoTitles,
          newVideoCount: newVideos,
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
  const now = new Date();
  const update: Record<string, unknown> = {
    videoCount: stored.items.length,
    youtubeItemCount,
    lastFetchedAt: now,
    fullRefetchedAt: now,
  };
  // 新着分ではなく取り直した全件から決める（前回が動画の保存後に失敗していても、ここで追いつく）
  if (stored.latestPublishedAt) {
    const current = playlist.latestVideoPublishedAt?.toDate?.() as Date | undefined;
    if (!current || stored.latestPublishedAt > current) update.latestVideoPublishedAt = stored.latestPublishedAt;
  }
  await playlistDoc.ref.update(update);

  return { newVideos, notifications };
}

/**
 * 監視の対象か（動画一覧を取り直し、新着を通知する。YouTube定期取得仕様書 §8.2、コンテンツ収集機能仕様書 §10.11）。
 * 掲載中は常に。それ以外は、掲載停止（opt_out）でなく、マイリスト登録者がいるか、動画一覧を取ったことがあって
 * チャンネルの掲載から外していないもの。
 */
function isMonitored(data: FirebaseFirestore.DocumentData, mylisted: boolean): boolean {
  if (data.isPublic !== true) return false;
  const status = data.listingStatus ?? 'listed';
  if (status === 'listed') return true;
  if (status === 'channel_off' && data.listingReason === 'opt_out') return false;
  return mylisted || (data.youtubeItemCount != null && status !== 'channel_off');
}

/**
 * 掲載チャンネルの巡回と、監視の対象の新着の確認。Firestore の想定外のエラーは呼び出し元へ投げる。
 * クォータの数え始め（resetQuotaCounter）は呼び出し元で行う（エラー時もそこまでの消費をログに残すため）。
 */
export async function refreshNewVideos(): Promise<RefreshSummary> {
  const now = new Date();
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
    sweptChannelCount: 0,
    sweepNewPlaylists: emptyNewCounts(),
    sweepErrors: [],
    fullRefetchedCount: 0,
    autoListedCount: 0,
    purgedCount: 0,
  };
  const titleOf = (d: QueryDocumentSnapshot) => (d.data().title as string) ?? d.id;
  const overBudget = (units: number) => summary.quotaExceeded || getQuotaConsumed() + units > NEW_VIDEOS_QUOTA_BUDGET;

  // ① 掲載チャンネルの巡回
  const counts = new Map<string, PlaylistItemCount>();
  const channels = await activeChannelsForSweep();
  if (channels.length > 0) {
    const ctx = { rules: await loadListingRules(), games: await loadGamesForSweep(), now };
    for (const channelDoc of channels) {
      if (overBudget(10)) break;
      try {
        const result = await sweepChannel(channelDoc, ctx);
        summary.sweptChannelCount++;
        result.itemCounts.forEach((v, k) => counts.set(k, v));
        for (const [k, v] of Object.entries(result.newCounts)) summary.sweepNewPlaylists[k as keyof NewPlaylistCounts] += v;
        summary.notFoundPlaylists.push(...result.missing);
      } catch (e) {
        if (!(e instanceof YouTubeApiError)) throw e;
        summary.sweepErrors.push({ explorationChannelId: channelDoc.id, message: errorMessage(e) });
        if (isQuotaExceededError(e)) {
          summary.quotaExceeded = true;
          break;
        }
      }
    }
  }

  // 監視の対象（巡回で作った・更新したあとの状態で選ぶ）
  const [playlistsSnap, mylistSnap] = await Promise.all([
    adminDb.collection('playlists').where('isPublic', '==', true).get(),
    adminDb.collection('mylist').select('playlistId').get(),
  ]);
  const mylisted = new Set(mylistSnap.docs.map((d) => d.data().playlistId as string));
  const docs = playlistsSnap.docs.filter((d) => isMonitored(d.data(), mylisted.has(d.id)));
  const monitoredIds = new Set(docs.map((d) => d.id));

  // ② 巡回で動画数が分からなかったものの動画数の確認（50件ずつ。失敗したまとまりはエラーとして残し、次の回に回す）
  const checked: QueryDocumentSnapshot[] = docs.filter((d) => counts.has(d.id));
  const toCheck = docs.filter((d) => !counts.has(d.id));
  const metaUpdates: Array<() => Promise<unknown>> = [];
  for (let i = 0; i < toCheck.length; i += COUNT_CHUNK_SIZE) {
    if (summary.quotaExceeded) {
      for (const d of toCheck.slice(i)) summary.errors.push({ playlistId: d.id, title: titleOf(d), message: '動画数の確認に失敗: quotaExceeded' });
      break;
    }
    const chunk = toCheck.slice(i, i + COUNT_CHUNK_SIZE);
    try {
      const result = await fetchPlaylistItemCounts(chunk.map((d) => d.id));
      result.forEach((v, k) => counts.set(k, v));
      checked.push(...chunk);
      for (const d of chunk) {
        const yt = result.get(d.id);
        if (!yt || !yt.isPublic) continue;
        const update: Record<string, unknown> = { metaFetchedAt: now };
        if (yt.title && yt.title !== d.data().title) update.title = yt.title;
        if (yt.thumbnailUrl && yt.thumbnailUrl !== d.data().thumbnailUrl) update.thumbnailUrl = yt.thumbnailUrl;
        metaUpdates.push(() => d.ref.update(update));
      }
    } catch (e) {
      const message = `動画数の確認に失敗: ${errorMessage(e)}`;
      const failed = isQuotaExceeded(e) ? toCheck.slice(i) : chunk;
      for (const d of failed) summary.errors.push({ playlistId: d.id, title: titleOf(d), message });
      if (isQuotaExceeded(e)) {
        summary.quotaExceeded = true;
      }
    }
  }
  for (let i = 0; i < metaUpdates.length; i += 20) await Promise.all(metaUpdates.slice(i, i + 20).map((f) => f()));
  summary.playlistsChecked = checked.length;

  // 振り分け
  const changed: Array<{ doc: QueryDocumentSnapshot; youtube: PlaylistItemCount }> = [];
  const unchanged: QueryDocumentSnapshot[] = [];
  for (const d of checked) {
    const youtube = counts.get(d.id);
    if (!youtube || !youtube.isPublic) {
      summary.notFoundPlaylists.push({ playlistId: d.id, title: titleOf(d) });
      continue;
    }
    if (d.data().youtubeItemCount !== youtube.itemCount) changed.push({ doc: d, youtube });
    else unchanged.push(d);
  }

  const refetch = async (doc: QueryDocumentSnapshot, youtube: PlaylistItemCount, isFull: boolean) => {
    if (overBudget(estimateVideoFetchCost(youtube.itemCount))) {
      summary.deferredCount++;
      return;
    }
    let result;
    try {
      result = await refetchPlaylist(doc, youtube.itemCount);
    } catch (e) {
      if (!(e instanceof YouTubeApiError)) throw e;
      if (isQuotaExceeded(e)) {
        summary.quotaExceeded = true;
        summary.deferredCount++;
        return;
      }
      summary.errors.push({ playlistId: doc.id, title: titleOf(doc), message: `取り直しに失敗: ${errorMessage(e)}` });
      return;
    }
    if (isFull) {
      summary.fullRefetchedCount++;
    } else {
      summary.playlistsRefetched++;
    }
    summary.notificationsCreated += result.notifications;
    if (result.newVideos > 0) {
      summary.playlistsWithNewVideos++;
      summary.totalNewVideos += result.newVideos;
      summary.newVideoDetails.push({ playlistId: doc.id, title: titleOf(doc), newVideos: result.newVideos });
    }
  };

  // ③ 動画数が変わった再生リストの取り直し（1回あたりの上限を超えそうなら、またはクォータが尽きたら残りは後回し。§7.3）
  for (const { doc, youtube } of changed) await refetch(doc, youtube, false);

  // ④ 30日ルール: 動画一覧を取ってから25日を過ぎるものを、古い順に（1日あたり対象の1/25、少なくとも10件）
  const stale = unchanged
    .filter((d) => d.data().youtubeItemCount != null && now.getTime() - videosAgeBase(d.data()) > REFETCH_AFTER_DAYS * DAY_MS)
    .sort((a, b) => videosAgeBase(a.data()) - videosAgeBase(b.data()));
  const dailyLimit = Math.max(10, Math.ceil(docs.length / REFETCH_AFTER_DAYS));
  // 期限（30日）に近いものは上限を超えて優先する
  const urgent = (d: QueryDocumentSnapshot) => now.getTime() - videosAgeBase(d.data()) > 28 * DAY_MS;
  let fullCount = 0;
  for (const d of stale) {
    if (fullCount >= dailyLimit && !urgent(d)) continue;
    await refetch(d, counts.get(d.id)!, true);
    fullCount++;
  }

  // ⑤ 自動で掲載する予定の再生リストを掲載する
  if (!summary.quotaExceeded) {
    const auto = await listAutoPending({ canSpend: (units) => !overBudget(units) });
    summary.autoListedCount = auto.listed;
    summary.deferredCount += auto.deferred;
    auto.errors.forEach((e) => summary.errors.push({ playlistId: e.playlistId, title: e.title, message: `掲載に失敗: ${e.message}` }));
  }

  // ⑥ 消し込み（YouTube API は使わない）。記録があり取り直しが要る再生リストのメタ情報は、動画数の確認と同じ呼び出しで取り直す
  const retention = await purgeStalePlaylists(monitoredIds, now);
  summary.purgedCount = retention.deletedPlaylists + retention.strippedPlaylists;
  const refreshIds = retention.refreshMetaIds.filter(() => !summary.quotaExceeded);
  for (let i = 0; i < refreshIds.length; i += COUNT_CHUNK_SIZE) {
    const chunk = refreshIds.slice(i, i + COUNT_CHUNK_SIZE);
    try {
      const result = await fetchPlaylistItemCounts(chunk);
      for (const id of chunk) {
        const yt = result.get(id);
        const ref = adminDb.collection('playlists').doc(id);
        if (yt) await ref.update({ ...(yt.title ? { title: yt.title } : {}), ...(yt.thumbnailUrl ? { thumbnailUrl: yt.thumbnailUrl } : {}), metaFetchedAt: now });
      }
    } catch (e) {
      if (!(e instanceof YouTubeApiError)) throw e;
      if (isQuotaExceeded(e)) break;
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
    sweptChannelCount: summary.sweptChannelCount,
    sweepNewPlaylists: summary.sweepNewPlaylists,
    fullRefetchedCount: summary.fullRefetchedCount,
    autoListedCount: summary.autoListedCount,
    purgedCount: summary.purgedCount,
    sweepErrors: summary.sweepErrors.slice(0, LOG_LIST_LIMIT),
  };
}
