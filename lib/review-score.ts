import { adminDb } from './firebase-admin';

/**
 * 再生リストスコア（信頼度加重平均）の再計算。共通 信頼度スコアリングシステム仕様書 §5。
 * レビューの作成・更新・削除・「参考になった」の増減のいずれの後にも呼び出す。
 * サーバー専用（API Routeからのみimportすること）。
 */
export async function recalculatePlaylistScore(playlistId: string): Promise<void> {
  const reviewsSnap = await adminDb.collection('reviews').where('playlistId', '==', playlistId).get();

  let weightedSum = 0;
  let weightTotal = 0;
  reviewsSnap.docs.forEach((d) => {
    const r = d.data();
    // §5.4: 星評価がないレビューはスコア計算対象から除外する（件数には含める）
    if (typeof r.starRating === 'number' && typeof r.trustScore === 'number') {
      weightedSum += r.starRating * r.trustScore;
      weightTotal += r.trustScore;
    }
  });

  // §5.3: レビューが0件（または加重合計が0）の場合はスコアを算出しない
  const score = weightTotal > 0 ? weightedSum / weightTotal : null;

  await adminDb.collection('playlists').doc(playlistId).update({
    score,
    reviewCount: reviewsSnap.size,
  });
}
