// 審査ワークフロー（`workflows`）の状態・承認処理中の印・運営メモなど、種別をまたいで使う定義（画面・サーバー共用、DB を使わない）。
// 管理 審査ワークフロー仕様書 §3・§5。種別ごとの承認・却下の処理は lib/workflow-decisions.ts から種別ごとのファイルへ振り分ける。
import { isChangeProposalType } from './change-proposal-shared';
import { PROPOSAL_TYPES } from './proposal-shared';
import { REVIEW_REPORT_TYPE } from './report-reasons';

export type WorkflowStatus = 'reviewing_lv1' | 'reviewing_lv2' | 'approved' | 'rejected';
export type DecisionAction = 'approve' | 'reject';

/**
 * 審査中の状態。二段階の審査（STEP1/STEP2）は作っていないため、新しい提案・通報は `reviewing_lv1` で作り、
 * そこから直接「承認」「却下」になる（`reviewing_lv2` へ進めるコードは無いが、読むときは審査中として扱う）
 */
export const PENDING_WORKFLOW_STATUSES: ReadonlySet<string> = new Set(['reviewing_lv1', 'reviewing_lv2']);

export function isPendingStatus(status: unknown): boolean {
  return typeof status === 'string' && PENDING_WORKFLOW_STATUSES.has(status);
}

/** 一覧・詳細に出す状態の名前 */
export function workflowStatusLabel(status: WorkflowStatus): string {
  return status === 'approved' ? '承認' : status === 'rejected' ? '却下' : '審査中';
}

/** 承認・却下で書く状態 */
export function decidedStatus(action: DecisionAction): 'approved' | 'rejected' {
  return action === 'approve' ? 'approved' : 'rejected';
}

/**
 * 承認処理中の印（`workflows.approvingAt`）の有効期間。同時に承認・却下して二重に処理しないよう、時間のかかる承認の前に立てる。
 * 処理が途中で落ちても詰まらないよう、これより古い印は取り直してよい
 */
export const APPROVING_LOCK_MS = 2 * 60 * 1000;

/** 承認処理中の印がまだ有効か（`approvingAtMs` が 0 なら印なし） */
export function isApprovingLocked(approvingAtMs: number, nowMs: number): boolean {
  return approvingAtMs > 0 && nowMs - approvingAtMs < APPROVING_LOCK_MS;
}

/** 運営メモの文字数上限（§11） */
export const MAX_OPERATOR_MEMO_LENGTH = 1000;

/** 運営メモの入力を保存する値にする（前後の空白を除き、上限で切る。空なら null）。文字列でなければ undefined（不正な依頼） */
export function normalizeOperatorMemo(value: unknown): string | null | undefined {
  if (typeof value !== 'string') return undefined;
  return value.trim().slice(0, MAX_OPERATOR_MEMO_LENGTH) || null;
}

/** 承認・却下のコメント（自由記述）。空なら null */
export function normalizeDecisionComment(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** 承認・却下の履歴（`step2History`）の1件。二段階の審査は作っていないため、記録は常に step2History に足す */
export function decisionHistoryEntry(params: {
  now: Date;
  uid: string;
  action: DecisionAction;
  comment: string | null;
  /** 種別ごとに足す項目（変更の提案の approveAction など） */
  extra?: Record<string, unknown>;
}) {
  return {
    executedAt: params.now,
    operatorId: params.uid,
    isAI: false,
    action: decidedStatus(params.action),
    comment: params.comment,
    ...params.extra,
  };
}

/** 提案者への審査結果の通知（`notifications`、type: review_result。ページ ユーザー通知機能仕様書 §2.1） */
export function reviewResultNotification(params: {
  userId: string;
  workflowId: string;
  message: string;
  now: Date;
  /** 通知を押したときの遷移先の再生リスト（無ければ提案履歴） */
  playlistId?: string | null;
  playlistTitle?: string;
}) {
  return {
    userId: params.userId,
    type: 'review_result',
    workflowId: params.workflowId,
    playlistId: params.playlistId ?? null,
    playlistTitle: params.playlistTitle ?? '',
    message: params.message,
    isRead: false,
    createdAt: params.now,
  };
}

/**
 * 未処理（審査中）の件数を、一覧の「通報」「提案」の行の数と同じ数え方で数える（審査ワークフロー仕様書 §5.3）。
 * 通報はレビューコメント通報と、詳細ページからの変更の提案（対象ごとに1件）。提案は再生リスト登録提案・ゲームタイトル登録提案・チャンネル申請。
 */
export function countPendingWorkflows(
  docs: Array<{ id: string; type: unknown; status: unknown; reportData?: Record<string, unknown> | null }>,
): { reports: number; proposals: number; total: number } {
  let reports = 0;
  let proposals = 0;
  const changeTargets = new Set<string>();
  for (const d of docs) {
    if (!isPendingStatus(d.status)) continue;
    if (d.type === REVIEW_REPORT_TYPE) reports++;
    else if (isChangeProposalType(d.type)) changeTargets.add(String(d.reportData?.targetKey ?? d.id));
    else if ((PROPOSAL_TYPES as readonly unknown[]).includes(d.type)) proposals++;
  }
  reports += changeTargets.size;
  return { reports, proposals, total: reports + proposals };
}
