// 手動の巡回と、掲載チャンネルに加えた直後の巡回（サーバー専用）。管理_Ai運営者 コンテンツ収集機能仕様書 §10.3・§10.11、
// 共通 YouTube定期取得仕様書 §8.6。
// 巡回（取り込みと判定。lib/channel-sweep.ts の sweepChannels）と、そのチャンネルの「自動で掲載する予定」の掲載だけを行い、
// 新着の監視・30日の取り直しは毎日の「新着動画の再取得」（lib/new-videos-refresh.ts）に任せる。
// クォータは収集の枠（1日 6,000。collection_quota_logs）で数え、実行ログは collection_batch_logs（kind: 'sweep'）に残す。
// （2026-11-17 までは lib/exploration-server.ts の exploreChannels。段階3までの「探索 → 収集候補」の名残りだったので改名した）
import { after } from 'next/server';
import { adminDb } from './firebase-admin';
import {
  activeChannelsForSweep,
  emptySweepChannelsResult,
  listAutoPending,
  loadSweepContext,
  sweepChannels,
  totalNewPlaylists,
  type NewPlaylistCounts,
} from './channel-sweep';
import { getQuotaConsumed, resetQuotaCounter } from './youtube';
import { addCollectionQuotaUsage, checkCollectionQuota, getCollectionQuotaUsedToday } from './collection-quota';
import { COLLECTION_DAILY_QUOTA_LIMIT } from './collection-quota-shared';

export interface ChannelSweepRunSummary {
  processedChannels: number;
  playlistsFetched: number;
  /** 新しく取り込んだ再生リストの数（掲載状態を問わない） */
  newPlaylistCount: number;
  newPlaylists: NewPlaylistCounts;
  autoListed: number;
  autoDeferred: number;
  quotaConsumed: number;
  errors: Array<{ explorationChannelId: string; message: string }>;
  status: 'success' | 'partial' | 'error';
}

export type ChannelSweepRunResult = { ok: true; summary: ChannelSweepRunSummary } | { ok: false; error: 'quota_exceeded'; remaining: number };

type Trigger = 'manual' | 'cron';

/**
 * collection_batch_logs の1件。項目名は段階3までのまま（`candidatesFound` は新しく取り込んだ再生リストの数）。
 * 管理画面の「最終巡回」（lib/collection-admin.ts の fetchLastCollectionBatch）が過去のログも同じ名前で読む。
 */
function batchLogOf(executedAt: Date, trigger: Trigger, executedBy: string | null, summary: ChannelSweepRunSummary) {
  const { newPlaylistCount, ...rest } = summary;
  return { executedAt, trigger, executedBy, kind: 'sweep', ...rest, candidatesFound: newPlaylistCount };
}

/**
 * 掲載チャンネル（status: active）を巡回する。explorationChannelId を渡すとそのチャンネルだけ。
 * 見込み（1チャンネルあたり最低1ユニット。§10.10）が収集の枠の残りに収まらなければ巡回せず quota_exceeded を返す
 * （recordSkip のときは、走らなかったことを後から確認できるよう実行ログにも残す）。
 * 想定外のエラー（Firestore の書き込み失敗等）は、そこまでのクォータ消費と実行ログを残してから投げる。
 */
export async function runChannelSweep(options: {
  trigger: Trigger;
  executedBy: string | null;
  explorationChannelId?: string;
  recordSkip?: boolean;
}): Promise<ChannelSweepRunResult> {
  const executedAt = new Date();
  const estimated = options.explorationChannelId
    ? 1
    : (await adminDb.collection('exploration_channels').where('status', '==', 'active').count().get()).data().count;
  const quota = await checkCollectionQuota(estimated);
  if (!quota.ok) {
    if (options.recordSkip) {
      await adminDb.collection('collection_batch_logs').add({
        executedAt,
        trigger: options.trigger,
        executedBy: options.executedBy,
        kind: 'sweep',
        processedChannels: 0,
        playlistsFetched: 0,
        candidatesFound: 0,
        quotaConsumed: 0,
        errors: [],
        status: 'skipped',
        reason: 'quota_exceeded',
      });
    }
    return { ok: false, error: 'quota_exceeded', remaining: quota.remaining };
  }

  resetQuotaCounter();
  const channels = await activeChannelsForSweep(options.explorationChannelId);
  const [ctx, usedBefore] = await Promise.all([loadSweepContext(executedAt), getCollectionQuotaUsedToday()]);
  const remaining = () => COLLECTION_DAILY_QUOTA_LIMIT - usedBefore - getQuotaConsumed();

  const swept = emptySweepChannelsResult();
  const summary: ChannelSweepRunSummary = {
    processedChannels: 0,
    playlistsFetched: 0,
    newPlaylistCount: 0,
    newPlaylists: swept.newCounts,
    autoListed: 0,
    autoDeferred: 0,
    quotaConsumed: 0,
    errors: [],
    status: 'success',
  };

  let fatalError: unknown = null;
  try {
    await sweepChannels(channels, ctx, { canSweep: () => remaining() > 0 }, swept);
    if (swept.swept.size > 0) {
      const auto = await listAutoPending({ canSpend: (units) => units <= remaining(), explorationChannelIds: swept.swept });
      summary.autoListed = auto.listed;
      summary.autoDeferred = auto.deferred;
      auto.errors.forEach((e) => summary.errors.push({ explorationChannelId: '', message: `${e.title}: ${e.message}` }));
    }
  } catch (e) {
    fatalError = e;
    summary.errors.push({ explorationChannelId: '', message: e instanceof Error ? e.message : 'unexpected_error' });
  } finally {
    summary.processedChannels = swept.swept.size;
    summary.playlistsFetched = swept.playlistsFetched;
    summary.newPlaylistCount = totalNewPlaylists(swept.newCounts);
    summary.errors.unshift(...swept.errors, ...swept.skipped.map((id) => ({ explorationChannelId: id, message: 'quota_exceeded' })));
    summary.quotaConsumed = getQuotaConsumed();
    await addCollectionQuotaUsage(summary.quotaConsumed);
    if (summary.errors.length > 0) {
      summary.status = summary.processedChannels > 0 && !fatalError ? 'partial' : 'error';
    }
    await adminDb.collection('collection_batch_logs').add(batchLogOf(executedAt, options.trigger, options.executedBy, summary));
  }
  if (fatalError) throw fatalError;
  return { ok: true, summary };
}

/**
 * 掲載チャンネルに加えた直後に、そのチャンネルを1回巡回する（掲載チャンネル画面で登録済みにしたとき・チャンネル申請の承認。§10.3）。
 * 枠が足りない・失敗したときは null（元の操作は成功のまま。毎日の巡回が拾う）。
 */
export async function sweepChannelNow(explorationChannelId: string, uid: string, label = '掲載チャンネルのその場の巡回'): Promise<{ newPlaylists: number } | null> {
  try {
    const result = await runChannelSweep({ trigger: 'manual', executedBy: uid, explorationChannelId });
    return result.ok ? { newPlaylists: result.summary.newPlaylistCount } : null;
  } catch (e) {
    console.error(`${label}に失敗`, explorationChannelId, e);
    return null;
  }
}

/**
 * sweepChannelNow を応答のあとに実行する（チャンネル申請の承認・再生リスト登録でのチャンネル同時掲載など、応答を待たせたくないとき）。
 * label は失敗したときのログに出す
 */
export function sweepChannelAfterResponse(explorationChannelId: string, uid: string, label: string): void {
  after(async () => {
    await sweepChannelNow(explorationChannelId, uid, label);
  });
}
