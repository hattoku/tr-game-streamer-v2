const COUNTER_COLLECTION = 'counters';
const COUNTER_DOC_ID = 'tags';

/**
 * `tags`コレクション共通の連番カウンタから、`TAG-{連番}`形式のIDをcount件まとめて
 * トランザクションで予約発行する（1始まり・ゼロ埋めなし。
 * 管理 マスタ管理仕様書.md 6.2/6.3節）。
 *
 * 重要: 将来、管理画面からのタグ追加・ユーザーによるタグ付与時の新規タグ作成でも
 * 必ずこの `counters/tags` ドキュメントを同じトランザクション手順で更新すること。
 * 独自に連番を計算する実装を別途作ると採番が衝突する。
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {number} count 発行するID数
 * @returns {Promise<string[]>}
 */
export async function issueTagIds(db, count) {
  if (count <= 0) return [];
  const ref = db.collection(COUNTER_COLLECTION).doc(COUNTER_DOC_ID);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = snap.exists ? (snap.data().lastNumber ?? 0) : 0;
    const ids = Array.from({ length: count }, (_, i) => `TAG-${last + i + 1}`);
    tx.set(ref, { lastNumber: last + count }, { merge: true });
    return ids;
  });
}
