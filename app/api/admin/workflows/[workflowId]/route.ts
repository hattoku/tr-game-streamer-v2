import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { recalculatePlaylistScore } from '@/lib/review-score';

// 審査ワークフロー（通報）の承認・却下・運営メモ更新API（管理_審査ワークフロー仕様書 §9, §11）。
// フェーズ6ステップ3の決定により対象typeは`review_report`のみ（提案系typeは投稿経路が無いため今回は扱わない）。
// operator/owner共通のためロール別の分岐は無い（requireAdminのみで判定）。
// STEP1/STEP2の二段階フローは実装しないため、承認・却下の記録は常にstep2Historyへ追記する
// （step1Historyは使わない。AI運営者・ジャンル別担当アサインが未実装のため）。
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ workflowId: string }> }) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { uid } = auth;

  const { workflowId } = await params;
  const workflowRef = adminDb.collection('workflows').doc(workflowId);
  const workflowSnap = await workflowRef.get();
  if (!workflowSnap.exists) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const workflow = workflowSnap.data()!;
  if (workflow.type !== 'review_report') {
    return NextResponse.json({ error: 'unsupported_type' }, { status: 400 });
  }

  const body = await request.json();
  const action = body.action;
  const comment = typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null;
  const now = new Date();

  if (action === 'update_memo') {
    if (typeof body.operatorMemo !== 'string') {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const operatorMemo = body.operatorMemo.trim().slice(0, 1000) || null;
    await workflowRef.update({ operatorMemo, updatedAt: now });
    return NextResponse.json({ ok: true });
  }

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }
  if (workflow.status !== 'reviewing_lv1' && workflow.status !== 'reviewing_lv2') {
    return NextResponse.json({ error: 'already_processed' }, { status: 409 });
  }
  if (action === 'reject' && !comment) {
    return NextResponse.json({ error: 'reject_reason_required' }, { status: 400 });
  }

  const reviewId = workflow.reportData?.reviewId as string | undefined;
  const playlistId = workflow.reportData?.playlistId as string | undefined;

  // 承認時は対象レビューを論理削除（非表示化）する（§3.1）。ドキュメントと内容は残し、承認時点の内容を
  // reportData.hiddenReviewSnapshot にも退避する（投稿者が後でレビューを削除しても審査記録に残るように）
  let hiddenReviewSnapshot: Record<string, unknown> | null = null;
  if (action === 'approve' && reviewId) {
    const reviewRef = adminDb.collection('reviews').doc(reviewId);
    // 読み取りから非表示化までの間に本人が削除・更新しても取りこぼさないようトランザクションにする
    const review = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(reviewRef);
      const data = snap.data();
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

  await workflowRef.update({
    ...(hiddenReviewSnapshot ? { 'reportData.hiddenReviewSnapshot': hiddenReviewSnapshot } : {}),
    status: action === 'approve' ? 'approved' : 'rejected',
    step2History: [
      ...(workflow.step2History ?? []),
      { executedAt: now, operatorId: uid, isAI: false, action: action === 'approve' ? 'approved' : 'rejected', comment },
    ],
    updatedAt: now,
  });

  return NextResponse.json({ ok: true });
}
