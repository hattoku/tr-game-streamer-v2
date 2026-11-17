// レビューコメント通報（`review_report`）の承認・却下（サーバー専用）。管理 審査ワークフロー仕様書 §4.1。
// 承認すると対象レビューを論理削除（非表示化）する。ドキュメントと内容は残し、承認時点の内容を
// reportData.hiddenReviewSnapshot にも退避する（投稿者が後でレビューを削除しても審査記録に残るように）。却下は掲載継続。
import { adminDb } from './firebase-admin';
import { recalculatePlaylistScore } from './review-score';
import { decisionHistoryEntry } from './workflow-shared';
import { ALREADY_PROCESSED, commitDecision, type WorkflowDecisionHandler } from './workflow-server';

export const decideReviewReport: WorkflowDecisionHandler = async ({ workflowRef, workflowId, workflow, action, uid, comment }) => {
  // 却下は自由記述の理由が必須
  if (action === 'reject' && !comment) return { error: 'reject_reason_required', status: 400 };
  const now = new Date();
  const reviewId = workflow.reportData?.reviewId as string | undefined;
  const playlistId = workflow.reportData?.playlistId as string | undefined;

  let hiddenReviewSnapshot: Record<string, unknown> | null = null;
  if (action === 'approve' && reviewId) {
    const reviewRef = adminDb.collection('reviews').doc(reviewId);
    // 読み取りから非表示化までの間に本人が削除・更新しても取りこぼさないようトランザクションにする
    const review = await adminDb.runTransaction(async (tx) => {
      const data = (await tx.get(reviewRef)).data();
      if (!data || data.isHidden === true) return null;
      tx.update(reviewRef, { isHidden: true, hiddenAt: now, hiddenByWorkflowId: workflowId });
      return data;
    });
    if (review) {
      hiddenReviewSnapshot = {
        userId: review.userId,
        userDisplayName: review.userDisplayName ?? null,
        starRating: review.starRating ?? null,
        comment: review.comment ?? null,
        hasSpoiler: review.hasSpoiler === true,
        postedAt: review.postedAt ?? null,
        updatedAt: review.updatedAt ?? null,
      };
      // users.reviewCount は表示中のレビューだけを数える
      const userRef = adminDb.collection('users').doc(review.userId as string);
      const userSnap = await userRef.get();
      const currentCount = userSnap.data()?.reviewCount ?? 0;
      if (userSnap.exists) await userRef.update({ reviewCount: Math.max(0, currentCount - 1) });
      if (playlistId) await recalculatePlaylistScore(playlistId);
    }
  }

  const committed = await commitDecision({
    ref: workflowRef,
    action,
    now,
    updates: hiddenReviewSnapshot ? { 'reportData.hiddenReviewSnapshot': hiddenReviewSnapshot } : {},
    historyEntry: decisionHistoryEntry({ now, uid, action, comment }),
  });
  return committed ? { ok: true } : ALREADY_PROCESSED;
};
