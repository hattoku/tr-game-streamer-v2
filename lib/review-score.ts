import { adminDb } from './firebase-admin';

// 視聴深度Dの最低保証値。共通 信頼度スコアリングシステム仕様書 v1.2 §3.1「D=0の下限」参照
const MIN_WATCH_DEPTH = 0.01;

/**
 * 視聴深度 D（共通 信頼度スコアリングシステム仕様書 §3.1）と最後に開いた話数を算出する。
 * 完走なら D=1。それ以外は watch_progress の最新の動画の位置から算出する。
 * app/api/reviews/upsert（投稿・更新）と app/api/mylist の DELETE（ステータス解除）で共用。
 */
export async function computeWatchDepth(
  uid: string,
  playlistId: string,
  videoCount: number,
  watchStatus: string | null,
  prevLastOpenedEpisode: number | null,
): Promise<{ watchDepth: number; lastOpenedEpisode: number | null }> {
  if (watchStatus === 'completed') return { watchDepth: 1, lastOpenedEpisode: prevLastOpenedEpisode };

  let lastOpenedEpisode = prevLastOpenedEpisode;
  let watchDepth = 0;
  const progressSnap = await adminDb
    .collection('watch_progress')
    .where('userId', '==', uid)
    .where('playlistId', '==', playlistId)
    .orderBy('updatedAt', 'desc')
    .limit(1)
    .get();
  const lastProgress = progressSnap.docs[0]?.data();
  if (lastProgress) {
    const videoSnap = await adminDb.collection('videos').doc(`${playlistId}_${lastProgress.youtubeVideoId}`).get();
    const position = videoSnap.data()?.position;
    if (typeof position === 'number' && videoCount > 0) {
      lastOpenedEpisode = position + 1;
      watchDepth = Math.min(1, lastOpenedEpisode / videoCount);
    }
  }
  // D=0（プレーヤーで一切視聴していない）のときのみ最低値を保証する。
  // H・G も同時に0だと W=(D+H+G)×C が0になり、加重平均の計算上そのレビューが
  // 存在しないのと同じになってしまう（2026-09-13 ユーザー確認の上、D側にのみ下限を設ける方針）
  if (watchDepth === 0) watchDepth = MIN_WATCH_DEPTH;
  return { watchDepth, lastOpenedEpisode };
}

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
