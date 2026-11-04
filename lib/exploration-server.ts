// 手動の巡回（サーバー専用）。管理_Ai運営者 コンテンツ収集機能仕様書 §10.3・§10.11、共通 YouTube定期取得仕様書 §8.6。
// 確認画面の「巡回を実行」・掲載チャンネル画面の「このチャンネルだけ巡回」・チャンネルを登録済みにした直後・
// チャンネル申請の承認（段階6）から呼ぶ。巡回（取り込みと判定）と、そのチャンネルの「自動で掲載する予定」の掲載だけを行い、
// 新着の監視・30日の取り直しは毎日の「新着動画の再取得」（lib/new-videos-refresh.ts）に任せる。
// クォータは収集の枠（1日 6,000。collection_quota_logs）で数える。
// 段階3までは「探索 → 収集候補」の処理だった。名前と引数は段階6の呼び出し元のためにそのまま残している。
import { adminDb } from './firebase-admin';
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
import { getQuotaConsumed, resetQuotaCounter, YouTubeApiError } from './youtube';
import { addCollectionQuotaUsage, getCollectionQuotaUsedToday } from './collection-quota';
import { COLLECTION_DAILY_QUOTA_LIMIT } from './collection-quota-shared';

export { fetchOperatorTagIdsByName } from './operator-tags';

export interface ExploreSummary {
  processedChannels: number;
  playlistsFetched: number;
  /** 新しく取り込んだ再生リストの数（掲載状態を問わない） */
  candidatesFound: number;
  newPlaylists: NewPlaylistCounts;
  autoListed: number;
  autoDeferred: number;
  quotaConsumed: number;
  errors: Array<{ explorationChannelId: string; message: string }>;
  status: 'success' | 'partial' | 'error';
}

/**
 * 掲載チャンネル（status: active）を巡回する。explorationChannelId を渡すとそのチャンネルだけ。
 * 想定外のエラー（Firestore の書き込み失敗等）は、そこまでのクォータ消費と実行ログを残してから投げる。
 */
export async function exploreChannels(options: {
  trigger: 'manual' | 'cron';
  executedBy: string | null;
  explorationChannelId?: string;
}): Promise<ExploreSummary> {
  const executedAt = new Date();
  resetQuotaCounter();

  const channels = await activeChannelsForSweep(options.explorationChannelId);
  const [rules, games, usedBefore] = await Promise.all([loadListingRules(), loadGamesForSweep(), getCollectionQuotaUsedToday()]);
  const ctx = { rules, games, now: executedAt };
  const remaining = () => COLLECTION_DAILY_QUOTA_LIMIT - usedBefore - getQuotaConsumed();

  const summary: ExploreSummary = {
    processedChannels: 0,
    playlistsFetched: 0,
    candidatesFound: 0,
    newPlaylists: emptyNewCounts(),
    autoListed: 0,
    autoDeferred: 0,
    quotaConsumed: 0,
    errors: [],
    status: 'success',
  };

  let fatalError: unknown = null;
  const swept = new Set<string>();
  try {
    for (const channelDoc of channels) {
      if (remaining() <= 0) {
        summary.errors.push({ explorationChannelId: channelDoc.id, message: 'quota_exceeded' });
        continue;
      }
      try {
        const result = await sweepChannel(channelDoc, ctx);
        swept.add(channelDoc.id);
        summary.processedChannels++;
        summary.playlistsFetched += result.playlistsFetched;
        for (const [k, v] of Object.entries(result.newCounts)) {
          summary.newPlaylists[k as keyof NewPlaylistCounts] += v;
          summary.candidatesFound += v;
        }
      } catch (e) {
        if (!(e instanceof YouTubeApiError)) throw e;
        summary.errors.push({ explorationChannelId: channelDoc.id, message: e.message });
        if (isQuotaExceededError(e)) break;
      }
    }
    if (swept.size > 0) {
      const auto = await listAutoPending({ canSpend: (units) => units <= remaining(), explorationChannelIds: swept });
      summary.autoListed = auto.listed;
      summary.autoDeferred = auto.deferred;
      auto.errors.forEach((e) => summary.errors.push({ explorationChannelId: '', message: `${e.title}: ${e.message}` }));
    }
  } catch (e) {
    fatalError = e;
    summary.errors.push({ explorationChannelId: '', message: e instanceof Error ? e.message : 'unexpected_error' });
  } finally {
    summary.quotaConsumed = getQuotaConsumed();
    await addCollectionQuotaUsage(summary.quotaConsumed);
    if (summary.errors.length > 0) {
      summary.status = summary.processedChannels > 0 && !fatalError ? 'partial' : 'error';
    }
    await adminDb.collection('collection_batch_logs').add({
      executedAt,
      trigger: options.trigger,
      executedBy: options.executedBy,
      kind: 'sweep',
      ...summary,
    });
  }
  if (fatalError) throw fatalError;
  return summary;
}
