// 退会・再開のサーバー側の処理（サーバー専用。API Route からのみ import する）。
// 退会＝アカウントは残し、ログインできなくする（2026-11-17 ユーザー決定。旧仕様の物理削除を置き換え）。
// 退会中は他の人からレビュー・プロフィール・公開マイリストを隠し、レビューはスコアからも外す。データは残し、再開で元に戻す。
// 管理 ユーザー管理仕様書 §3.4・§3.5、Firestore データモデル設計書 §3.1・§7.1。
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from './firebase-admin';
import { recalculatePlaylistScore } from './review-score';
import { accountStatusOf, type WithdrawnBy } from './account-status-shared';

/** 管理者だけが読む、ユーザーごとの運営用の記録（備考・管理者が退会させた理由）。本人には読ませない */
export const ADMIN_USER_RECORDS = 'admin_user_records';

/**
 * 本人のレビューに「投稿者が退会中」の印を付ける／外し、関係する再生リストのスコアと件数を計算し直す。
 * 通報で非表示（isHidden）とは別の印にして、再開したときに通報の非表示を巻き戻さないようにする。
 */
async function markReviewsAuthorWithdrawn(uid: string, withdrawn: boolean): Promise<void> {
  const snap = await adminDb.collection('reviews').where('userId', '==', uid).get();
  const playlistIds = new Set<string>();
  const writer = adminDb.bulkWriter();
  let failed = 0;
  for (const d of snap.docs) {
    const data = d.data();
    if ((data.isAuthorWithdrawn === true) === withdrawn) continue;
    if (typeof data.playlistId === 'string') playlistIds.add(data.playlistId);
    writer.update(d.ref, { isAuthorWithdrawn: withdrawn ? true : FieldValue.delete() }).catch(() => {
      failed += 1;
    });
  }
  await writer.close();
  for (const playlistId of playlistIds) {
    try {
      await recalculatePlaylistScore(playlistId);
    } catch (e) {
      console.error(`[account-status] スコアの再計算に失敗 (playlistId=${playlistId})`, e);
      failed += 1;
    }
  }
  // 失敗したら API をエラーにする。もう一度同じ操作をすると、状態はそのままで印付けとスコアだけやり直す
  if (failed > 0) throw new Error(`[account-status] レビューの印・スコアの更新に ${failed} 件失敗 (uid=${uid})`);
}

export interface WithdrawInput {
  by: WithdrawnBy;
  /** 本人が選んだ・書いた理由（任意） */
  reason?: string | null;
  /** 管理者が退会させた理由（任意。admin_user_records に置く） */
  adminReason?: string | null;
}

/** 退会させる。すでに退会中なら false（そのときもレビューの印付けはやり直す。前回途中で失敗した分を直すため） */
export async function withdrawAccount(uid: string, input: WithdrawInput): Promise<boolean> {
  const userRef = adminDb.collection('users').doc(uid);
  const now = new Date();
  const changed = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists || accountStatusOf(snap.data()) === 'withdrawn') return false;
    tx.update(userRef, {
      accountStatus: 'withdrawn',
      withdrawnAt: now,
      withdrawnBy: input.by,
      withdrawReason: input.by === 'self' && input.reason ? input.reason : null,
    });
    if (input.by === 'admin') {
      tx.set(
        adminDb.collection(ADMIN_USER_RECORDS).doc(uid),
        { adminWithdrawReason: input.adminReason || null },
        { merge: true },
      );
    }
    return true;
  });
  if (!changed) {
    if (accountStatusOf((await userRef.get()).data()) === 'withdrawn') await markReviewsAuthorWithdrawn(uid, true);
    return false;
  }
  // ログイン中の端末を締め出す（クライアントは users の購読でも気づく。次のトークン更新で切れる）
  await adminAuth.revokeRefreshTokens(uid).catch((e) => console.error('[account-status] トークンの失効に失敗', e));
  await markReviewsAuthorWithdrawn(uid, true);
  return true;
}

/** 退会を解除する（本人の再開・管理者の解除）。退会中でなければ false（そのときもレビューの印外しはやり直す） */
export async function restoreAccount(uid: string): Promise<boolean> {
  const userRef = adminDb.collection('users').doc(uid);
  const changed = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists || accountStatusOf(snap.data()) !== 'withdrawn') return false;
    tx.update(userRef, {
      accountStatus: 'active',
      withdrawnAt: FieldValue.delete(),
      withdrawnBy: FieldValue.delete(),
      withdrawReason: FieldValue.delete(),
      restoredAt: new Date(),
    });
    tx.set(adminDb.collection(ADMIN_USER_RECORDS).doc(uid), { adminWithdrawReason: FieldValue.delete() }, { merge: true });
    return true;
  });
  if (!changed) {
    if (accountStatusOf((await userRef.get()).data()) === 'active') await markReviewsAuthorWithdrawn(uid, false);
    return false;
  }
  await markReviewsAuthorWithdrawn(uid, false);
  return true;
}

/** 管理画面での操作を operation_logs に残す（Firestore データモデル設計書 §3.18、管理 ユーザー管理仕様書 §6） */
export async function writeOperationLog(input: {
  operatorId: string;
  action: string;
  targetId: string;
  targetName?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    const operator = (await adminDb.collection('users').doc(input.operatorId).get()).data();
    await adminDb.collection('operation_logs').add({
      operatorId: input.operatorId,
      operatorName: typeof operator?.displayName === 'string' ? operator.displayName : '',
      action: input.action,
      targetId: input.targetId,
      targetName: input.targetName ?? null,
      detail: input.detail ?? null,
      executedAt: new Date(),
    });
  } catch (e) {
    // 記録に失敗しても操作そのものは成功させる
    console.error('[operation_logs] 記録に失敗', e);
  }
}
