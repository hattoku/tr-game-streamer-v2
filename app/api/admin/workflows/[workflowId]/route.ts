import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { recalculatePlaylistScore } from '@/lib/review-score';
import { FieldValue } from 'firebase-admin/firestore';
import { registerPlaylist, type PlaylistApiError } from '@/lib/playlist-registration';
import { GAME_PROPOSAL_TYPE, PLAYLIST_PROPOSAL_TYPE, proposalRejectReasonLabel } from '@/lib/proposal-shared';

// 審査ワークフローの承認・却下・運営メモ更新API（管理_審査ワークフロー仕様書 §9, §11）。
// 対象typeは`review_report`（通報、フェーズ6ステップ3）と、提案系の`playlist_register`・`game_title_register`
// （フェーズ7ステップ7-4）。ゲームタイトル編集提案（`game_title_edit`）は投稿経路が無いため扱わない。
// - 再生リスト登録提案の承認: /api/playlists/register と同じ登録処理（lib/playlist-registration.ts）を実行する。
//   `gameId` を渡すと提案のゲームタイトルを差し替えて登録し、editHistory に記録する（§10.1 の最小版、2026-10-25 ユーザー決定）。
//   未登録チャンネルの説明文は `channelDescription`（任意）。登録に失敗したら審査中のまま残す。
//   新しいゲームタイトル付きの提案（proposalData.gameId が null、§14.3 v10.1）は、管理者が GameCreateModal で登録した gameId を渡す。
// - ゲームタイトル登録提案（旧形式、v10.1 以降は新規作成なし）の承認: 管理者が先に GameCreateModal（POST /api/admin/games）で登録し、その `createdGameId` を渡す。
// - 再生リスト登録提案の却下は定型の見送り理由 `rejectReasonCode` が必須で、`comment` は任意の内部メモ（§14.4 v11.0）。
//   承認・却下とも提案者にサイト内通知（`notifications`、type: "review_result"）を作る（§14.4。ページ ユーザー通知機能仕様書 §2.1）。
// operator/owner共通のためロール別の分岐は無い（requireAdminのみで判定）。
// STEP1/STEP2の二段階フローは実装しないため、承認・却下の記録は常にstep2Historyへ追記する
// （step1Historyは使わない。AI運営者・ジャンル別担当アサインが未実装のため）。
// 再生リスト登録提案の承認処理中の印（approvingAt）の有効期間
const APPROVING_LOCK_MS = 2 * 60 * 1000;

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
  if (workflow.type !== 'review_report' && workflow.type !== PLAYLIST_PROPOSAL_TYPE && workflow.type !== GAME_PROPOSAL_TYPE) {
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
  // 再生リスト登録提案の却下は定型理由が必須（自由記述は任意）。それ以外の却下は自由記述が必須
  const rejectReasonLabel = proposalRejectReasonLabel(body.rejectReasonCode);
  if (action === 'reject' && (workflow.type === PLAYLIST_PROPOSAL_TYPE ? !rejectReasonLabel : !comment)) {
    return NextResponse.json({ error: 'reject_reason_required' }, { status: 400 });
  }

  const historyEntry = {
    executedAt: now,
    operatorId: uid,
    isAI: false,
    action: action === 'approve' ? 'approved' : 'rejected',
    comment,
  };

  if (workflow.type === PLAYLIST_PROPOSAL_TYPE || workflow.type === GAME_PROPOSAL_TYPE) {
    const updates: Record<string, unknown> = {};
    if (action === 'approve' && workflow.type === PLAYLIST_PROPOSAL_TYPE) {
      const proposal = workflow.proposalData ?? {};
      // 新しいゲームタイトル付きの提案（§14.3 v10.1）は gameId が null。管理者が先にゲームタイトルを登録（または選択）して gameId を渡す
      const originalGameId = (proposal.gameId as string | null) ?? null;
      const gameId = typeof body.gameId === 'string' && body.gameId ? body.gameId : originalGameId;
      if (!gameId) {
        return NextResponse.json({ error: 'game_required' }, { status: 400 });
      }

      // 同時承認で二重登録しないよう、承認処理中の印（approvingAt）をトランザクションで先に取る。
      // 処理が途中で落ちた場合に詰まらないよう、2分より古い印は取り直してよい
      const claimed = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(workflowRef);
        const current = snap.data();
        if (!current || (current.status !== 'reviewing_lv1' && current.status !== 'reviewing_lv2')) return false;
        const approvingAt = current.approvingAt?.toMillis?.() ?? 0;
        if (approvingAt && now.getTime() - approvingAt < APPROVING_LOCK_MS) return false;
        tx.update(workflowRef, { approvingAt: now });
        return true;
      });
      if (!claimed) {
        return NextResponse.json({ error: 'already_processed' }, { status: 409 });
      }

      const result = await registerPlaylist({
        playlistUrl: proposal.playlistUrl as string,
        gameId,
        channelDescription: body.channelDescription,
        registeredBy: uid,
        proposedBy: workflow.submittedBy as string,
      });
      let registered: { playlistId: string; gameName: string } | null = 'error' in result ? null : result;
      // 前回の承認で登録まで済み、ワークフローの更新だけ失敗していた場合（この提案者の提案として登録済み）は承認として扱う
      if ('error' in result && result.error === 'already_registered' && proposal.youtubePlaylistId) {
        const existing = (await adminDb.collection('playlists').doc(proposal.youtubePlaylistId as string).get()).data();
        if (existing && existing.proposedBy === workflow.submittedBy) {
          registered = { playlistId: proposal.youtubePlaylistId as string, gameName: (existing.gameName as string) ?? '' };
        }
      }
      if (!registered) {
        await workflowRef.update({ approvingAt: FieldValue.delete() });
        const error = result as PlaylistApiError;
        return NextResponse.json({ error: error.error, message: error.message }, { status: error.status });
      }
      updates.approvingAt = FieldValue.delete();
      updates['proposalData.registeredPlaylistId'] = registered.playlistId;
      if (gameId !== originalGameId) {
        updates['proposalData.approvedGameId'] = gameId;
        updates['proposalData.approvedGameName'] = registered.gameName;
        updates.editHistory = [
          ...(workflow.editHistory ?? []),
          { editedAt: now, operatorId: uid, field: 'gameId', from: originalGameId, to: gameId },
        ];
      }
    }
    if (action === 'approve' && workflow.type === GAME_PROPOSAL_TYPE) {
      const createdGameId = typeof body.createdGameId === 'string' ? body.createdGameId : '';
      if (!createdGameId || !(await adminDb.collection('games').doc(createdGameId).get()).exists) {
        return NextResponse.json({ error: 'game_not_found' }, { status: 404 });
      }
      updates['proposalData.createdGameId'] = createdGameId;
    }
    if (action === 'reject' && workflow.type === PLAYLIST_PROPOSAL_TYPE) {
      updates['proposalData.rejectReasonCode'] = body.rejectReasonCode;
    }
    const batch = adminDb.batch();
    batch.update(workflowRef, {
      ...updates,
      status: action === 'approve' ? 'approved' : 'rejected',
      step2History: [...(workflow.step2History ?? []), historyEntry],
      updatedAt: now,
    });
    // 審査結果通知（§14.4）。再生リスト登録提案のみ（旧形式のゲームタイトル登録提案は対象外）
    if (workflow.type === PLAYLIST_PROPOSAL_TYPE && workflow.submittedBy) {
      const playlistTitle = (workflow.proposalData?.title as string) ?? '';
      const registeredPlaylistId = (updates['proposalData.registeredPlaylistId'] as string | undefined) ?? null;
      batch.set(adminDb.collection('notifications').doc(), {
        userId: workflow.submittedBy,
        type: 'review_result',
        workflowId,
        playlistId: action === 'approve' ? registeredPlaylistId : null,
        playlistTitle,
        message:
          action === 'approve'
            ? `再生リスト「${playlistTitle}」の提案が承認され、公開されました`
            : `再生リスト「${playlistTitle}」の提案は見送りになりました（${rejectReasonLabel}）`,
        isRead: false,
        createdAt: now,
      });
    }
    await batch.commit();
    return NextResponse.json({ ok: true });
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
    step2History: [...(workflow.step2History ?? []), historyEntry],
    updatedAt: now,
  });

  return NextResponse.json({ ok: true });
}
