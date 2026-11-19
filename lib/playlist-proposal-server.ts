// 再生リスト登録提案（`playlist_register`）の承認・却下（サーバー専用）。管理 審査ワークフロー仕様書 §4.2、ページ 提案する 仕様書。
// - 承認: /api/playlists/register と同じ登録処理（lib/playlist-registration.ts）を実行する。すでに `playlists` にある掲載していない
//   再生リスト（巡回で取り込んだもの）は掲載にする（lib/propose-server.ts の publishExistingPlaylist）。
//   `gameId` を渡すと提案のゲームタイトルを差し替えて登録し、editHistory に記録する。新しいゲームタイトル付きの提案
//   （proposalData.gameId が null で newGameTitle あり）は、管理者が先に登録・選択した gameId が要る。ゲームが分からない提案（noGame）は
//   ゲームを決めずに承認できる。未登録チャンネルの説明文は `channelDescription`（任意）。登録に失敗したら審査中のまま残す。
// - 却下: 定型の見送り理由 `rejectReasonCode` が必須で、`comment` は任意の内部メモ。
// 承認・却下とも提案者にサイト内通知（review_result）を作る。
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { registerPlaylist, type PlaylistApiError } from './playlist-registration';
import { getProposalChannelState } from './channel-application-server';
import { publishExistingPlaylist } from './propose-server';
import { playlistProposalResultMessage, proposalRejectReasonLabel } from './proposal-shared';
import { decisionHistoryEntry, reviewResultNotification } from './workflow-shared';
import {
  ALREADY_PROCESSED,
  claimApproving,
  commitDecision,
  releaseApproving,
  type WorkflowDecisionHandler,
} from './workflow-server';

export const decidePlaylistProposal: WorkflowDecisionHandler = async ({ workflowRef, workflowId, workflow, action, uid, comment, body }) => {
  const rejectReasonLabel = proposalRejectReasonLabel(body.rejectReasonCode);
  if (action === 'reject' && !rejectReasonLabel) return { error: 'reject_reason_required', status: 400 };
  const now = new Date();
  const proposal = workflow.proposalData ?? {};
  const updates: Record<string, unknown> = {};

  if (action === 'approve') {
    const originalGameId = (proposal.gameId as string | null) ?? null;
    const gameId: string | null = typeof body.gameId === 'string' && body.gameId ? body.gameId : originalGameId;
    if (!gameId && proposal.newGameTitle) return { error: 'game_required', status: 400 };

    // 承認時にも掲載チャンネルかを確かめる。外れていたら承認せず審査中のまま残す
    const proposalChannelId = proposal.channelId as string | undefined;
    if (proposalChannelId && (await getProposalChannelState(proposalChannelId)) !== 'listed') {
      return { error: 'channel_not_listed', status: 409 };
    }

    if (!(await claimApproving(workflowRef, now))) return ALREADY_PROCESSED;

    const existingSnap = proposal.youtubePlaylistId ? await adminDb.collection('playlists').doc(proposal.youtubePlaylistId as string).get() : null;
    const existingData = existingSnap?.exists ? existingSnap.data()! : null;
    const publishExisting = !!existingData && (existingData.listingStatus ?? 'listed') !== 'listed';
    // 提案で掲載になったことを再生リストにも残す（提案者）。掲載のあとにワークフローの更新だけ失敗しても、
    // 次の承認で「この提案者の提案として登録済み」と分かるよう、掲載より先に書く
    const previousProposedBy = (existingData?.proposedBy as string | null | undefined) ?? null;
    if (publishExisting) await existingSnap!.ref.update({ proposedBy: workflow.submittedBy ?? null });
    const result = publishExisting
      ? await publishExistingPlaylist({ playlistId: existingSnap!.id, gameId, uid, allowHidden: false })
      : await registerPlaylist({
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
      // 掲載できなかったときは、先に書いた提案者を元に戻す（掲載していない再生リストに提案者を残さない）
      if (publishExisting) await existingSnap!.ref.update({ proposedBy: previousProposedBy }).catch(() => {});
      await releaseApproving(workflowRef);
      const error = result as PlaylistApiError | { error: string; status: number; message?: string };
      return { error: error.error, status: error.status, message: error.message };
    }
    updates.approvingAt = FieldValue.delete();
    updates['proposalData.registeredPlaylistId'] = registered.playlistId;
    if (gameId !== originalGameId) {
      updates['proposalData.approvedGameId'] = gameId;
      updates['proposalData.approvedGameName'] = registered.gameName;
      updates.editHistory = [...(workflow.editHistory ?? []), { editedAt: now, operatorId: uid, field: 'gameId', from: originalGameId, to: gameId }];
    }
  } else {
    updates['proposalData.rejectReasonCode'] = body.rejectReasonCode;
  }

  const playlistTitle = (proposal.title as string) ?? '';
  const notification = workflow.submittedBy
    ? reviewResultNotification({
        userId: workflow.submittedBy as string,
        workflowId,
        now,
        playlistId: action === 'approve' ? ((updates['proposalData.registeredPlaylistId'] as string | undefined) ?? null) : null,
        playlistTitle,
        message: playlistProposalResultMessage(playlistTitle, action, rejectReasonLabel),
      })
    : null;

  const committed = await commitDecision({
    ref: workflowRef,
    action,
    now,
    updates,
    historyEntry: decisionHistoryEntry({ now, uid, action, comment }),
    notification,
  });
  return committed ? { ok: true } : ALREADY_PROCESSED;
};
