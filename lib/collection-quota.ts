// コンテンツ収集（チャンネル特定・探索・承認）の YouTube API クォータ管理（サーバー専用）。
// 管理_Ai運営者 コンテンツ収集機能仕様書 v3.0 §6。
// 1日の消費を collection_quota_logs/{YYYY-MM-DD}（日本時間）に積算し、上限を超える操作は実行前に拒否する。
// 上限値と日付の区切りは管理画面と共用の lib/collection-quota-shared.ts。
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { COLLECTION_DAILY_QUOTA_LIMIT, todayJst } from './collection-quota-shared';

export async function getCollectionQuotaUsedToday(): Promise<number> {
  const snap = await adminDb.collection('collection_quota_logs').doc(todayJst()).get();
  return (snap.data()?.quotaConsumed as number | undefined) ?? 0;
}

/** これから使う見込みのユニット数が今日の残りに収まるか。収まらなければ残量を返す */
export async function checkCollectionQuota(estimated: number): Promise<{ ok: true } | { ok: false; remaining: number }> {
  const used = await getCollectionQuotaUsedToday();
  const remaining = COLLECTION_DAILY_QUOTA_LIMIT - used;
  return estimated <= remaining ? { ok: true } : { ok: false, remaining: Math.max(0, remaining) };
}

export async function addCollectionQuotaUsage(units: number): Promise<void> {
  if (units <= 0) return;
  const date = todayJst();
  await adminDb
    .collection('collection_quota_logs')
    .doc(date)
    .set({ date, quotaConsumed: FieldValue.increment(units), recordedAt: new Date() }, { merge: true });
}
