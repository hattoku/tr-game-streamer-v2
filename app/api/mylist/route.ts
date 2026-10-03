import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { computeWatchDepth, recalculatePlaylistScore } from '@/lib/review-score';

// マイリストの削除専用API（HANDOFF.md 未解決事項11、フェーズ4.5ステップ3）。
// playlists.mylistCount の増減は、firestore.rules 上 playlists の一般ユーザー更新許可
// フィールドが playlistTagIds のみのためクライアントSDKからは構造的に不可能。
// 削除だけこの Admin SDK API に寄せ、FieldValue.increment で減算する
// （app/(main)/mylist/page.tsx の「マイリストから削除」ボタンで使用）。
// 削除時は reviews.watchStatus（非正規化コピー）も解除し、レビュー一覧に古いステータスが残らないようにする。
// マイリストへの追加・視聴ステータス変更（増加側の increment を含む）は再生リスト詳細
// ページの視聴ステータス記録UIから app/api/reviews/upsert 経由で行う（フェーズ○ 視聴ステータス
// 記録・レビュー投稿UI統合。旧 AddToMylistButton.tsx の POST 経路はこの統合で廃止した）。
// 逆順トグルはカウントに影響しないため、引き続きクライアントSDK直書き
// （components/mylist/MylistCard.tsx・app/(main)/mylist/page.tsx 参照）。

export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const uid = auth.uid;

  const body = await request.json();
  const playlistId = typeof body.playlistId === 'string' ? body.playlistId : '';
  if (!playlistId) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const mylistRef = adminDb.collection('mylist').doc(`${uid}_${playlistId}`);
  const mylistSnap = await mylistRef.get();
  if (!mylistSnap.exists) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const reviewRef = adminDb.collection('reviews').doc(`${uid}_${playlistId}`);
  const reviewSnap = await reviewRef.get();
  const review = reviewSnap.data();

  const batch = adminDb.batch();
  batch.delete(mylistRef);
  batch.update(adminDb.collection('playlists').doc(playlistId), { mylistCount: FieldValue.increment(-1) });

  // reviews.watchStatus（非正規化コピー）も解除する（ページ マイリスト機能仕様書 §5.9。
  // app/api/reviews/upsert のステータス解除経路と同じ結果にする）。
  // 星評価・コメントがあればレビューは残してステータスだけ外し、視聴深度D・信頼度Wを再計算する
  // （完走を外すと D=1 固定が外れるため）。どちらも無ければレビューごと削除する
  if (review) {
    if (review.starRating != null || review.comment) {
      const playlistSnap = await adminDb.collection('playlists').doc(playlistId).get();
      const { watchDepth, lastOpenedEpisode } = await computeWatchDepth(
        uid,
        playlistId,
        playlistSnap.data()?.videoCount ?? 0,
        null,
        review.lastOpenedEpisode ?? null,
      );
      const helpfulScore = Math.log((review.helpfulCount ?? 0) + 1);
      const genreExpertiseScore = typeof review.genreExpertiseScore === 'number' ? review.genreExpertiseScore : 0;
      const commentScore = typeof review.commentScore === 'number' ? review.commentScore : review.comment ? 1 : 0.5;
      batch.update(reviewRef, {
        watchStatus: null,
        watchDepth,
        lastOpenedEpisode,
        trustScore: (watchDepth + helpfulScore + genreExpertiseScore) * commentScore,
        updatedAt: new Date(),
      });
    } else {
      const userRef = adminDb.collection('users').doc(uid);
      const userSnap = await userRef.get();
      batch.delete(reviewRef);
      batch.update(userRef, { reviewCount: Math.max(0, (userSnap.data()?.reviewCount ?? 0) - 1) });
    }
  }
  await batch.commit();
  // レビューの削除・信頼度の変化のどちらでも再生リストスコアが変わる
  if (review) await recalculatePlaylistScore(playlistId);

  return NextResponse.json({ ok: true });
}
