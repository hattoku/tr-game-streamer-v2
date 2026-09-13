import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { recalculatePlaylistScore } from '@/lib/review-score';

// 「参考になった」の押下・取り消し（レビュー投稿機能仕様書「参考になったボタン」節）。
// helpfulCount の増減は信頼度スコア（変数H）の再計算を伴うため、helpful_votes の
// 作成・削除と合わせて Admin SDK 側でまとめて処理する（クライアントは reviews.helpfulCount を
// 直接更新できないルールのため）。同じレビューへの投票は1人1回（再クリックで取り消し）。
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const uid = auth.uid;

  const { reviewId } = (await request.json()) as { reviewId?: string };
  if (typeof reviewId !== 'string' || !reviewId) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const reviewRef = adminDb.collection('reviews').doc(reviewId);
  const reviewSnap = await reviewRef.get();
  if (!reviewSnap.exists) {
    return NextResponse.json({ error: 'review_not_found' }, { status: 404 });
  }
  const review = reviewSnap.data()!;
  if (review.userId === uid) {
    return NextResponse.json({ error: 'own_review' }, { status: 403 });
  }

  const voteRef = adminDb.collection('helpful_votes').doc(`${uid}_${reviewId}`);
  const voteSnap = await voteRef.get();
  const willVote = !voteSnap.exists;

  if (willVote) {
    await voteRef.set({ userId: uid, reviewId, votedAt: new Date() });
  } else {
    await voteRef.delete();
  }

  const helpfulCount = Math.max(0, (review.helpfulCount ?? 0) + (willVote ? 1 : -1));
  const helpfulScore = Math.log(helpfulCount + 1);
  const trustScore = ((review.watchDepth ?? 0) + helpfulScore + (review.genreExpertiseScore ?? 0)) * (review.commentScore ?? 0.5);

  await reviewRef.update({ helpfulCount, trustScore });

  // users.helpfulReceivedCount（集計キャッシュ）: レビュー投稿者側の被獲得数
  const ownerRef = adminDb.collection('users').doc(review.userId);
  const ownerSnap = await ownerRef.get();
  const currentReceived = ownerSnap.data()?.helpfulReceivedCount ?? 0;
  await ownerRef.update({ helpfulReceivedCount: Math.max(0, currentReceived + (willVote ? 1 : -1)) });

  await recalculatePlaylistScore(review.playlistId);

  return NextResponse.json({ voted: willVote, helpfulCount });
}
