// プロフィール編集のサーバー側の共通処理（ページ 設定 プロフィール仕様書 §9）。サーバー専用。
import { adminDb } from './firebase-admin';

type DenormalizedUserFields = { userDisplayName?: string; userProfileImageUrl?: string | null };

/**
 * 自分の reviews に非正規化して持っている投稿者名・アイコン（userDisplayName / userProfileImageUrl）を新しい値に揃える。
 * 投稿者名・アイコンからプロフィールへリンクするため、リンク先と表示を食い違わせない（2026-10-12 ユーザー決定）。
 * userId の等価条件のみで引くため複合インデックスは不要。
 * 個々の書き込み失敗は BulkWriter の既定リトライ後に握り潰す（未処理 rejection にしない）。取り残した分は古い値のまま残るが、
 * 次にその値を変えたとき（値が異なる分）か、そのレビューを保存し直したときに揃う
 */
export async function syncUserDenormalizedFields(userId: string, fields: DenormalizedUserFields, label: string): Promise<void> {
  const keys = Object.keys(fields) as Array<keyof DenormalizedUserFields>;
  if (keys.length === 0) return;
  const reviewSnap = await adminDb.collection('reviews').where('userId', '==', userId).get();
  let failed = 0;
  const writer = adminDb.bulkWriter();
  for (const d of reviewSnap.docs) {
    const data = d.data();
    const changed = keys.filter((k) => (data[k] ?? null) !== (fields[k] ?? null));
    if (changed.length === 0) continue;
    writer.update(d.ref, Object.fromEntries(changed.map((k) => [k, fields[k] ?? null]))).catch(() => {
      failed += 1;
    });
  }
  await writer.close();
  if (failed > 0) console.error(`[${label}] 投稿者名・アイコンの更新に ${failed} 件失敗 (uid=${userId})`);
}
