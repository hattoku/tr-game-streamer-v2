// 本人の退会＝本人の作成データの消去（サーバー専用。API Route からのみ import する）。
// 2026-11-19 ユーザー決定: 本人が退会したときは、アカウントとデータを残さず消去する（レビューは本人の記録なので、
// 消去の意思を尊重する）。同じメールアドレスでログインしても戻せない。管理者が退会させる場合は従来どおり締め出し方式
// （lib/account-status-server.ts）。仕様: ページ 設定 仕様書 §8、Firestore データモデル設計書 §7.1。
//
// 消すもの: レビューと、それに付いた「参考になった」／本人が押した「参考になった」（相手のレビューの数を戻す）／
// マイリスト・視聴位置・視聴履歴・視聴開始の記録・通知・保存したまとめ・まとめ・お問い合わせ（やり取りと添付画像）・
// 各種カウンター・アイコン画像・運営用の記録・Firebase Auth のアカウント・users。
// 残すもの（本人を特定できない形で）: 審査済みの提案・通報（提出者を空にする）、再生リストの提案者・タグの作成者・
// ゲームの付け外し履歴の操作者（null にする）、管理者の操作ログ（対象の ID と名前を消す）。
// 通報で非表示にしたレビューの内容の控え（hiddenReviewSnapshot）は消す。退会の理由は uid を付けずに別に残す。
//
// 途中で失敗してもやり直せる作りにする: 消す前に「再計算が要る再生リスト・本人のレビューID」を account_deletions/{uid} に
// 控え、同じ操作をもう一度すると控えを足して続きから消す。users を先に、Firebase Auth を最後に消す
// （Auth が残っていれば、users が無くてももう一度実行できる）。
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { adminApp, adminAuth, adminDb } from './firebase-admin';
import { recalculatePlaylistScore } from './review-score';
import { ADMIN_USER_RECORDS } from './account-status-server';

/** 退会の理由（uid を付けない）。選択肢＋自由記述 */
export const WITHDRAWAL_REASONS = 'withdrawal_reasons';
/** 消去の途中経過の控え（サーバーだけが読み書きする。消去が終わったら消す） */
export const ACCOUNT_DELETIONS = 'account_deletions';

const BATCH = 400;

/** userId が一致する文書を消す対象のコレクション（IDは問わない） */
const OWNED_BY_USER_ID = [
  'mylist',
  'watch_progress',
  'watch_history',
  'playlist_viewers',
  'notifications',
  'saved_collections',
  'collections',
  'inquiry_upload_counters',
  'game_link_counters',
  'fraud_alerts',
] as const;

async function deleteRefs(refs: FirebaseFirestore.DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = adminDb.batch();
    refs.slice(i, i + BATCH).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

async function deleteByField(collection: string, field: string, value: string): Promise<number> {
  const snap = await adminDb.collection(collection).where(field, '==', value).select().get();
  await deleteRefs(snap.docs.map((d) => d.ref));
  return snap.size;
}

async function deleteStoragePrefix(prefix: string): Promise<void> {
  try {
    await getStorage(adminApp).bucket().deleteFiles({ prefix, force: true });
  } catch (e) {
    // 取り残した分はどこからも参照されない。退会そのものは止めない
    console.error(`[account-delete] ${prefix} を削除できませんでした`, e);
  }
}

/**
 * 本人が押した「参考になった」を取り消し、相手のレビューの数・信頼度・投稿者の被獲得数を戻す。
 * 数を戻すことと票を消すことは1つのトランザクションにして、途中で失敗してやり直しても二重に引かないようにする
 */
async function undoHelpfulVotesCast(uid: string, ownReviewIds: Set<string>, playlistIds: Set<string>): Promise<void> {
  const votes = await adminDb.collection('helpful_votes').where('userId', '==', uid).select('reviewId').get();
  for (const vote of votes.docs) {
    const reviewId = vote.get('reviewId') as string | undefined;
    // 自分のレビューへの投票はできない。自分のレビューは丸ごと消えるので数え直さない
    if (!reviewId || ownReviewIds.has(reviewId)) {
      await vote.ref.delete();
      continue;
    }
    const reviewRef = adminDb.collection('reviews').doc(reviewId);
    const playlistId = await adminDb.runTransaction(async (tx) => {
      const [voteSnap, reviewSnap] = await Promise.all([tx.get(vote.ref), tx.get(reviewRef)]);
      if (!voteSnap.exists) return null; // 前回の実行で取り消し済み
      const review = reviewSnap.data();
      if (review) {
        const helpfulCount = Math.max(0, (review.helpfulCount ?? 0) - 1);
        // lib/review-score.ts と app/api/reviews/helpful/route.ts と同じ式（信頼度＝(視聴深度＋参考になった＋専門性)×コメント）
        const trustScore =
          ((review.watchDepth ?? 0) + Math.log(helpfulCount + 1) + (review.genreExpertiseScore ?? 0)) * (review.commentScore ?? 0.5);
        const ownerRef = adminDb.collection('users').doc(review.userId as string);
        const owner = (await tx.get(ownerRef)).data();
        tx.update(reviewRef, { helpfulCount, trustScore });
        if (owner) tx.update(ownerRef, { helpfulReceivedCount: Math.max(0, (owner.helpfulReceivedCount ?? 0) - 1) });
      }
      tx.delete(vote.ref);
      return typeof review?.playlistId === 'string' ? (review.playlistId as string) : null;
    });
    if (playlistId) playlistIds.add(playlistId);
  }
}

async function deleteInquiries(uid: string): Promise<void> {
  const snap = await adminDb.collection('inquiries').where('userId', '==', uid).select().get();
  for (const inquiry of snap.docs) {
    const messages = await inquiry.ref.collection('messages').select().get();
    await deleteRefs(messages.docs.map((m) => m.ref));
    await deleteStoragePrefix(`inquiries/${inquiry.id}/`);
    await inquiry.ref.delete();
  }
}

/** 審査の記録から本人を外す。審査中の提案・自分のレビューへの通報は消し、審査済みのものは提出者を空にする */
async function detachWorkflows(uid: string, ownReviewIds: string[]): Promise<void> {
  const pending = (status: unknown) => status === 'reviewing_lv1' || status === 'reviewing_lv2';

  const mine = await adminDb.collection('workflows').where('submittedBy', '==', uid).get();
  const toDelete: FirebaseFirestore.DocumentReference[] = [];
  for (const d of mine.docs) {
    if (pending(d.get('status'))) toDelete.push(d.ref);
    else await d.ref.update({ submittedBy: '' });
  }

  // 本人のレビューへの通報（レビューごと消えるので審査できない）。審査済みでも、非表示にしたときのレビュー内容の控えは消す
  for (const reviewId of ownReviewIds) {
    const reports = await adminDb.collection('workflows').where('reportData.reviewId', '==', reviewId).get();
    for (const d of reports.docs) {
      if (pending(d.get('status'))) toDelete.push(d.ref);
      else if (d.get('reportData.hiddenReviewSnapshot') !== undefined) {
        await d.ref.update(new FieldPath('reportData', 'hiddenReviewSnapshot'), FieldValue.delete());
      }
    }
  }
  await deleteRefs(toDelete);
}

async function detachCatalog(uid: string): Promise<void> {
  const playlists = await adminDb.collection('playlists').where('proposedBy', '==', uid).select().get();
  for (const d of playlists.docs) await d.ref.update({ proposedBy: null });
  const tags = await adminDb.collection('tags').where('createdBy', '==', uid).select().get();
  for (const d of tags.docs) await d.ref.update({ createdBy: null });
  // ゲームの付け外し履歴（再生リスト側の記録は残し、操作者だけ外す）
  const changes = await adminDb.collection('playlist_game_changes').where('userId', '==', uid).select().get();
  for (const d of changes.docs) await d.ref.update({ userId: null });
  // 管理者がこのユーザーに行った操作の記録（対象の ID と名前を消す。誰が何をしたかは残す）
  const logs = await adminDb.collection('operation_logs').where('targetId', '==', uid).select().get();
  for (const d of logs.docs) await d.ref.update({ targetId: '', targetName: null });
}

export interface DeleteAccountResult {
  reviews: number;
}

/**
 * 本人の作成データを消し、アカウントそのものも消す。
 * 途中で失敗したら例外にする（アカウントはまだあるので、もう一度同じ操作をすれば残りを消す）。
 * Firebase Auth と users は最後に消す。
 */
export async function deleteAccountAndData(uid: string, reason: string | null): Promise<DeleteAccountResult> {
  // ⓪ 前回の途中経過があれば引き継ぐ（レビューを消した後に失敗しても、再計算する再生リストを忘れない）
  const progressRef = adminDb.collection(ACCOUNT_DELETIONS).doc(uid);
  const progress = (await progressRef.get()).data();
  const playlistIds = new Set<string>((progress?.playlistIds as string[] | undefined) ?? []);
  const reviewIds = new Set<string>((progress?.reviewIds as string[] | undefined) ?? []);
  // 退会の理由を入れる文書のID（やり直しても1件にするため、最初に決めて控える）
  const reasonDocId: string = (progress?.reasonDocId as string | undefined) ?? adminDb.collection(WITHDRAWAL_REASONS).doc().id;

  const reviews = await adminDb.collection('reviews').where('userId', '==', uid).get();
  for (const d of reviews.docs) {
    reviewIds.add(d.id);
    if (typeof d.get('playlistId') === 'string') playlistIds.add(d.get('playlistId') as string);
  }
  const votes = await adminDb.collection('helpful_votes').where('userId', '==', uid).select('reviewId').get();
  for (const v of votes.docs) {
    const target = (await adminDb.collection('reviews').doc(v.get('reviewId') as string).get()).data();
    if (typeof target?.playlistId === 'string') playlistIds.add(target.playlistId);
  }
  await progressRef.set(
    { playlistIds: [...playlistIds], reviewIds: [...reviewIds], reasonDocId, startedAt: progress?.startedAt ?? new Date() },
    { merge: true },
  );

  // ① レビュー（と、それに付いた「参考になった」）
  for (const reviewId of reviewIds) await deleteByField('helpful_votes', 'reviewId', reviewId);
  // ② 本人が押した「参考になった」（相手のレビューに反映した数を戻す）
  await undoHelpfulVotesCast(uid, reviewIds, playlistIds);
  await deleteRefs(reviews.docs.map((d) => d.ref));

  // ③ 審査の記録・一般公開データの作成者表記から外す
  await detachWorkflows(uid, [...reviewIds]);
  await detachCatalog(uid);

  // ④ 個人のデータ・お問い合わせ・画像
  for (const name of OWNED_BY_USER_ID) await deleteByField(name, 'userId', uid);
  await deleteInquiries(uid);
  await deleteStoragePrefix(`avatars/${uid}/`);

  // ⑤ 消えたレビューの分、再生リストのスコアと件数を計算し直す
  for (const playlistId of playlistIds) {
    try {
      await recalculatePlaylistScore(playlistId);
    } catch (e) {
      // 再生リスト自体が無い場合など。ここで止めると退会が終わらないので記録だけ残す
      console.error(`[account-delete] スコアの再計算に失敗 (playlistId=${playlistId})`, e);
    }
  }

  // ⑥ 退会の理由は、誰のものか分からない形で残す（同じ ID に書くので、やり直しても1件）
  if (reason) await adminDb.collection(WITHDRAWAL_REASONS).doc(reasonDocId).set({ reason, withdrawnAt: progress?.startedAt ?? new Date() });

  // ⑦ 運営用の記録・users を消し、最後にログインできるアカウントそのものを消す
  await adminDb.collection(ADMIN_USER_RECORDS).doc(uid).delete();
  await adminDb.collection('users').doc(uid).delete();
  await adminAuth.deleteUser(uid).catch((e: { code?: string }) => {
    if (e?.code !== 'auth/user-not-found') throw e;
  });
  await progressRef.delete();

  return { reviews: reviewIds.size };
}
