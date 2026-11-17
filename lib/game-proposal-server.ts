// ゲームタイトル登録提案（`game_title_register`）の承認・却下（サーバー専用）。管理 審査ワークフロー仕様書 §4.3。
// 管理者が先に GameCreateModal（POST /api/admin/games）で登録するか既存のゲームを選び、そのIDを `createdGameId` で渡して承認する。
// - ゲーム未設定の再生リストに付けたいゲームの提案（proposalData.playlistId あり。再生リスト詳細の「ゲームを登録」）は、
//   承認でその再生リストにゲームを付け、提案者に結果を通知する。
// - 旧形式（proposalData.playlistUrl 付き。2026-10-25 以降は作られない）は、ゲームを登録した記録を残すだけで通知しない。
// 却下は自由記述の理由が必須（内部メモ）。
import { adminDb } from './firebase-admin';
import { linkPlaylistToGame } from './playlist-game-linking';
import { gameProposalResultMessage } from './proposal-shared';
import { decisionHistoryEntry, reviewResultNotification } from './workflow-shared';
import { ALREADY_PROCESSED, commitDecision, type WorkflowDecisionHandler } from './workflow-server';

export const decideGameProposal: WorkflowDecisionHandler = async ({ workflowRef, workflowId, workflow, action, uid, comment, body }) => {
  if (action === 'reject' && !comment) return { error: 'reject_reason_required', status: 400 };
  const now = new Date();
  const proposal = workflow.proposalData ?? {};
  const targetPlaylistId = (proposal.playlistId as string | undefined) ?? null;
  const updates: Record<string, unknown> = {};

  if (action === 'approve') {
    const createdGameId = typeof body.createdGameId === 'string' ? body.createdGameId : '';
    if (!createdGameId || !(await adminDb.collection('games').doc(createdGameId).get()).exists) {
      return { error: 'game_not_found', status: 404 };
    }
    updates['proposalData.createdGameId'] = createdGameId;
    // 再生リストに付けたい提案は、その再生リストにこのゲームを付ける（すでに付いていれば何もしない）
    if (targetPlaylistId) {
      const linked = await linkPlaylistToGame(targetPlaylistId, createdGameId, 'admin', uid);
      // 提案のあとに別の経路（ユーザーの登録・自動照合）で別のゲームが付いていた、または再生リストが無いときは、
      // 承認として通知してしまわないよう、承認せず管理者に知らせる（すでに同じゲームが付いているのは成功）
      const sameGame =
        linked === 'already_set' && (await adminDb.collection('playlists').doc(targetPlaylistId).get()).data()?.gameId === createdGameId;
      if (linked !== 'linked' && !sameGame) {
        return { error: linked === 'already_set' ? 'playlist_game_already_set' : linked, status: 409 };
      }
    }
  }

  // 審査結果の通知は再生リストに付けたい提案だけ（旧形式は対象外）
  const notification =
    targetPlaylistId && workflow.submittedBy
      ? reviewResultNotification({
          userId: workflow.submittedBy as string,
          workflowId,
          now,
          playlistId: targetPlaylistId,
          playlistTitle: (proposal.playlistTitle as string) ?? '',
          message: gameProposalResultMessage((proposal.gameTitle as string) ?? '', action),
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
