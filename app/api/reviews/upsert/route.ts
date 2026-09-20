import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { recalculatePlaylistScore } from '@/lib/review-score';
import { REVIEW_WATCH_STATUS_VALUES, MYLIST_COMPATIBLE_REVIEW_STATUSES } from '@/lib/review-status';

// レビューの投稿・上書き更新（ページ 再生リスト レビュー投稿機能 仕様書）。
// 1ユーザー×1再生リストのため、ドキュメントIDは mylist 等と同じ `{uid}_{playlistId}` 形式にする。
// 信頼度スコア（D/H/G/C/W、共通 信頼度スコアリングシステム仕様書）はジャンル専門性の算出に
// 他ユーザー横断のクエリが必要でクライアントから信頼できないため、Admin SDK 側で計算する
// （app/api/playlists/register/route.ts と同じアーキテクチャ）。
//
// NGワード判定: firestore.rules は ng_words を管理者以外に非公開としているため
// （回避策を助長しないため）、最終送信時のサーバー側チェックはここで行う。入力中の
// リアルタイムチェックは app/api/reviews/validate-comment/route.ts（デバウンス呼び出し）。

const MAX_COMMENT_LENGTH = 2000;
// 視聴深度Dの最低保証値。共通 信頼度スコアリングシステム仕様書 v1.2 §3.1「D=0の下限」参照
const MIN_WATCH_DEPTH = 0.01;

interface UpsertBody {
  playlistId?: string;
  starRating?: number | null;
  watchStatus?: string | null;
  comment?: string | null;
  hasSpoiler?: boolean;
}

async function findNgWordHit(text: string): Promise<boolean> {
  const snap = await adminDb.collection('ng_words').get();
  return snap.docs.some((d) => {
    const word = d.data().word as string | undefined;
    return !!word && text.includes(word);
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const uid = auth.uid;

  const body = (await request.json()) as UpsertBody;
  const playlistId = body.playlistId;
  if (typeof playlistId !== 'string' || !playlistId) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const starRating = typeof body.starRating === 'number' ? body.starRating : null;
  if (starRating != null && (starRating < 0.5 || starRating > 5 || Math.round(starRating * 2) !== starRating * 2)) {
    return NextResponse.json({ error: 'invalid_star_rating' }, { status: 400 });
  }

  const watchStatus =
    typeof body.watchStatus === 'string' && REVIEW_WATCH_STATUS_VALUES.has(body.watchStatus) ? body.watchStatus : null;

  const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
  if (comment.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json({ error: 'comment_too_long' }, { status: 400 });
  }
  if (comment.includes('http://') || comment.includes('https://')) {
    return NextResponse.json({ error: 'url_in_comment' }, { status: 400 });
  }
  if (comment && (await findNgWordHit(comment))) {
    return NextResponse.json({ error: 'ng_word' }, { status: 400 });
  }

  const hasSpoiler = body.hasSpoiler === true;

  // 星評価・視聴ステータス・コメントのいずれも無い投稿は成立しない（仕様書「コメント欄」節）
  if (starRating == null && watchStatus == null && !comment) {
    return NextResponse.json({ error: 'empty_review' }, { status: 400 });
  }

  const playlistRef = adminDb.collection('playlists').doc(playlistId);
  const playlistSnap = await playlistRef.get();
  if (!playlistSnap.exists) {
    return NextResponse.json({ error: 'playlist_not_found' }, { status: 404 });
  }
  const playlist = playlistSnap.data()!;

  const reviewId = `${uid}_${playlistId}`;
  const reviewRef = adminDb.collection('reviews').doc(reviewId);
  const [existingSnap, userSnap] = await Promise.all([reviewRef.get(), adminDb.collection('users').doc(uid).get()]);
  const existing = existingSnap.data();
  const userData = userSnap.data();

  // 視聴深度 D（信頼度スコアリングシステム仕様書 §3.1）
  let lastOpenedEpisode: number | null = existing?.lastOpenedEpisode ?? null;
  let watchDepth = 0;
  if (watchStatus === 'completed') {
    watchDepth = 1;
  } else {
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
      if (typeof position === 'number' && playlist.videoCount > 0) {
        lastOpenedEpisode = position + 1;
        watchDepth = Math.min(1, lastOpenedEpisode / playlist.videoCount);
      }
    }
    // D=0（プレーヤーで一切視聴していない）のときのみ最低値を保証する。
    // H・G も同時に0だと W=(D+H+G)×C が0になり、加重平均の計算上そのレビューが
    // 存在しないのと同じになってしまう（2026-09-13 ユーザー確認の上、D側にのみ下限を設ける方針）
    if (watchDepth === 0) watchDepth = MIN_WATCH_DEPTH;
  }

  // 参考になった数 H（§3.2）: helpfulCount 自体は helpful/route.ts でのみ増減する
  const helpfulCount: number = existing?.helpfulCount ?? 0;
  const helpfulScore = Math.log(helpfulCount + 1);

  // ジャンル専門性 G（§3.4）: 自分のマイリスト（対象再生リスト自身を除く）のうち、
  // 対象ゲームと同一ジャンルを持つ再生リストの件数
  const targetGenreIds: string[] = playlist.gameGenreIds ?? [];
  let genreOverlapCount = 0;
  if (targetGenreIds.length > 0) {
    const mylistSnap = await adminDb.collection('mylist').where('userId', '==', uid).get();
    const otherPlaylistIds = mylistSnap.docs
      .map((d) => d.data().playlistId as string)
      .filter((id) => id !== playlistId);
    if (otherPlaylistIds.length > 0) {
      const playlistDocs = await Promise.all(otherPlaylistIds.map((id) => adminDb.collection('playlists').doc(id).get()));
      genreOverlapCount = playlistDocs.filter((d) => {
        const genreIds: string[] = d.data()?.gameGenreIds ?? [];
        return genreIds.some((g) => targetGenreIds.includes(g));
      }).length;
    }
  }
  const genreExpertiseScore = Math.log(genreOverlapCount + 1);

  // コメント有無 C（§3.3）
  const commentScore = comment ? 1 : 0.5;

  const trustScore = (watchDepth + helpfulScore + genreExpertiseScore) * commentScore;

  const now = new Date();
  const batch = adminDb.batch();

  batch.set(reviewRef, {
    userId: uid,
    playlistId,
    starRating,
    watchStatus,
    comment: comment || null,
    hasSpoiler,
    helpfulCount,
    trustScore,
    watchDepth,
    lastOpenedEpisode,
    genreExpertiseScore,
    commentScore,
    // レビュー一覧の投稿者表示用の非正規化コピー（HANDOFF.md未解決事項1参照。usersは本人・
    // 管理者以外読めないため、表示側で参照できるようレビュー側にスナップショットを持つ）。
    // プロフィール変更後にレビュー側が古いままになりうるが、次回レビュー更新時に追従する
    // （channelName等、他の非正規化フィールドと同じ許容範囲の設計）。
    userDisplayName: (userData?.displayName as string | undefined) || 'ユーザー',
    userProfileImageUrl: (userData?.profileImageUrl as string | undefined) ?? null,
    postedAt: existing ? existing.postedAt : now,
    updatedAt: now,
  });

  // users.reviewCount（集計キャッシュ）は新規投稿時のみ加算する
  if (!existing) {
    const userRef = adminDb.collection('users').doc(uid);
    batch.update(userRef, { reviewCount: (userData?.reviewCount ?? 0) + 1 });
  }

  // マイリスト自動登録（仕様書「マイリスト登録」節）。"reviewing" は mylist に対応する値が
  // 無いため、未登録時のみ既定値 "want_to_watch" で登録する（2つのステータス概念は独立に扱う）。
  const mylistRef = adminDb.collection('mylist').doc(`${uid}_${playlistId}`);
  const mylistSnap = await mylistRef.get();
  if (!mylistSnap.exists) {
    batch.set(mylistRef, {
      userId: uid,
      playlistId,
      watchStatus: watchStatus && MYLIST_COMPATIBLE_REVIEW_STATUSES.has(watchStatus) ? watchStatus : 'want_to_watch',
      isReverseOrder: false,
      createdAt: now,
      updatedAt: now,
    });
    batch.update(playlistRef, { mylistCount: FieldValue.increment(1) });
  } else if (
    watchStatus &&
    MYLIST_COMPATIBLE_REVIEW_STATUSES.has(watchStatus) &&
    mylistSnap.data()!.watchStatus !== watchStatus
  ) {
    batch.update(mylistRef, { watchStatus, updatedAt: now });
  }

  await batch.commit();
  await recalculatePlaylistScore(playlistId);

  return NextResponse.json({ reviewId });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { playlistId } = (await request.json()) as { playlistId?: string };
  if (typeof playlistId !== 'string' || !playlistId) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const reviewId = `${auth.uid}_${playlistId}`;
  const reviewRef = adminDb.collection('reviews').doc(reviewId);
  const reviewSnap = await reviewRef.get();
  if (reviewSnap.exists) {
    await reviewRef.delete();
    const userRef = adminDb.collection('users').doc(auth.uid);
    const userSnap = await userRef.get();
    const currentCount = userSnap.data()?.reviewCount ?? 0;
    await userRef.update({ reviewCount: Math.max(0, currentCount - 1) });
  }
  await recalculatePlaylistScore(playlistId);

  return NextResponse.json({ ok: true });
}
