// 審査ワークフローの承認・却下を種別ごとの処理へ振り分ける（サーバー専用）。管理 審査ワークフロー仕様書 §3・§4・§6。
// PATCH /api/admin/workflows/[workflowId] は、運営メモの保存・審査中かどうかの確認だけを行い、承認・却下はここから種別ごとのファイルへ渡す。
// 種別を足すときは、種別ごとのファイルに WorkflowDecisionHandler を作り、この表に1行足す（画面は app/admin/workflows/[workflowId]/page.tsx）。
import { CHANGE_PROPOSAL_TYPES } from './change-proposal-shared';
import { decideChangeProposal } from './change-proposal-server';
import { CHANNEL_APPLICATION_TYPE } from './channel-application-shared';
import { decideChannelApplication } from './channel-application-server';
import { decideGameProposal } from './game-proposal-server';
import { decidePlaylistProposal } from './playlist-proposal-server';
import { GAME_PROPOSAL_TYPE, PLAYLIST_PROPOSAL_TYPE } from './proposal-shared';
import { REVIEW_REPORT_TYPE } from './report-reasons';
import { decideReviewReport } from './review-report-server';
import type { WorkflowDecisionHandler } from './workflow-server';

const HANDLERS: Record<string, WorkflowDecisionHandler> = {
  [REVIEW_REPORT_TYPE]: decideReviewReport,
  [PLAYLIST_PROPOSAL_TYPE]: decidePlaylistProposal,
  [GAME_PROPOSAL_TYPE]: decideGameProposal,
  [CHANNEL_APPLICATION_TYPE]: decideChannelApplication,
  ...Object.fromEntries(CHANGE_PROPOSAL_TYPES.map((type) => [type, decideChangeProposal])),
};

/** 種別の承認・却下の処理。審査画面で扱わない種別なら null */
export function workflowDecisionHandler(type: unknown): WorkflowDecisionHandler | null {
  return typeof type === 'string' && Object.hasOwn(HANDLERS, type) ? HANDLERS[type] : null;
}
