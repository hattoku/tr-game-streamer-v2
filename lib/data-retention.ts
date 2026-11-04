// YouTube のデータの保存期間（YouTube API サービス規約 III.E.4）に沿った消し込み（サーバー専用）。YouTube API は使わない。
// 管理_Ai運営者 コンテンツ収集機能仕様書 §10.8・§10.11、共通 YouTube定期取得仕様書 §8.4・§8.6。
import { adminDb } from './firebase-admin';

export const RETENTION_DAYS = 30;
/** 動画一覧・メタ情報をこの日数を過ぎる前に取り直す（30日に余裕を持たせる） */
export const REFETCH_AFTER_DAYS = 25;
const DAY_MS = 24 * 60 * 60 * 1000;
const PURGE_LIMIT = 500;

function millis(value: unknown): number | null {
  return (value as { toMillis?: () => number } | null | undefined)?.toMillis?.() ?? null;
}

/** メタ情報を最後に取り直した日時（無ければ lastFetchedAt → registeredAt） */
export function metaAgeBase(data: FirebaseFirestore.DocumentData): number {
  return millis(data.metaFetchedAt) ?? millis(data.lastFetchedAt) ?? millis(data.registeredAt) ?? 0;
}

/** 動画一覧を最後に全件取り直した日時（無ければ lastFetchedAt → registeredAt） */
export function videosAgeBase(data: FirebaseFirestore.DocumentData): number {
  return millis(data.fullRefetchedAt) ?? millis(data.lastFetchedAt) ?? millis(data.registeredAt) ?? 0;
}

/** ユーザーの記録（マイリスト・レビュー・視聴履歴・視聴位置）が1件でもあるか */
export async function hasUserRecords(playlistId: string): Promise<boolean> {
  for (const name of ['mylist', 'reviews', 'watch_history', 'watch_progress']) {
    const snap = await adminDb.collection(name).where('playlistId', '==', playlistId).limit(1).get();
    if (!snap.empty) return true;
  }
  return false;
}

async function deleteVideosOf(playlistId: string): Promise<void> {
  const snap = await adminDb.collection('videos').where('playlistId', '==', playlistId).select().get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = adminDb.batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

export interface RetentionSummary {
  /** 消した再生リスト（playlists・videos） */
  deletedPlaylists: number;
  /** YouTube 由来の項目を消した再生リスト（opt_out で記録が残るもの） */
  strippedPlaylists: number;
  deletedCandidates: number;
}

/**
 * 掲載中でなく、監視の対象でもない再生リストの消し込み。
 * - 記録なし: playlists・videos を消す（掲載し直せば巡回で作り直される）
 * - opt_out で記録あり: YouTube 由来の項目を空にして動画を消す
 * - それ以外で記録あり: 呼び出し側が先にメタ情報を取り直す（refreshMeta）。ここでは触らない
 * `monitored` は監視の対象の再生リストID。`refreshMetaIds` に、記録があり取り直しが要るID（opt_out 以外）を集めて返す。
 */
export async function purgeStalePlaylists(monitored: Set<string>, now: Date): Promise<RetentionSummary & { refreshMetaIds: string[] }> {
  const summary = { deletedPlaylists: 0, strippedPlaylists: 0, deletedCandidates: 0, refreshMetaIds: [] as string[] };
  const cutoff = now.getTime() - RETENTION_DAYS * DAY_MS;
  const staleSoon = now.getTime() - REFETCH_AFTER_DAYS * DAY_MS;
  const snap = await adminDb.collection('playlists').where('listingStatus', '!=', 'listed').get();
  let handled = 0;
  for (const doc of snap.docs) {
    if (handled >= PURGE_LIMIT) break;
    const data = doc.data();
    if (monitored.has(doc.id) || data.youtubeDataRemovedAt) continue;
    const base = metaAgeBase(data);
    if (base > staleSoon) continue;
    handled++;
    const records = await hasUserRecords(doc.id);
    const optOut = data.listingStatus === 'channel_off' && data.listingReason === 'opt_out';
    if (base > cutoff) {
      // 30日に近づいた: 記録があり掲載を止めていないものは、メタ情報を取り直す（呼び出し側）
      if (records && !optOut) summary.refreshMetaIds.push(doc.id);
      continue;
    }
    if (!records) {
      await deleteVideosOf(doc.id);
      await doc.ref.delete();
      summary.deletedPlaylists++;
    } else if (optOut) {
      await deleteVideosOf(doc.id);
      await doc.ref.update({
        title: '掲載を終了した再生リスト',
        thumbnailUrl: '',
        channelName: '',
        channelIconUrl: '',
        videoCount: 0,
        latestVideoPublishedAt: null,
        youtubeDataRemovedAt: now,
      });
      summary.strippedPlaylists++;
    } else {
      summary.refreshMetaIds.push(doc.id);
    }
  }

  // 収集候補（段階3までの承認待ち）。巡回に取り込まれたものは取り込み時に消すので、残りは30日で消す
  const candidates = await adminDb.collection('collection_candidates').where('collectedAt', '<', new Date(cutoff)).limit(PURGE_LIMIT).get();
  for (let i = 0; i < candidates.docs.length; i += 400) {
    const batch = adminDb.batch();
    candidates.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  summary.deletedCandidates = candidates.size;

  // 名前検索の候補の登録者数（統計値）は30日で消す
  const channels = await adminDb.collection('exploration_channels').where('status', '==', 'pending_confirm').get();
  for (const ch of channels.docs) {
    const data = ch.data();
    const list = (data.searchCandidates as Array<Record<string, unknown>> | undefined) ?? [];
    const updatedAt = millis(data.updatedAt) ?? 0;
    if (updatedAt < cutoff && list.some((c) => c.subscriberCount != null)) {
      await ch.ref.update({ searchCandidates: list.map((c) => ({ ...c, subscriberCount: null })) });
    }
  }
  return summary;
}
