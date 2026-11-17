// 審査ワークフローの承認・却下で種別をまたいで使うサーバー側の処理（Admin SDK）。管理 審査ワークフロー仕様書 §9・§12。
// 種別ごとの処理（lib/workflow-decisions.ts から振り分ける）は、承認処理中の印の取り外しと、状態の確定＋通知をここで行う。
import { FieldValue, type DocumentData, type DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { decidedStatus, isApprovingLocked, isPendingStatus, type DecisionAction } from './workflow-shared';

/** 審査 API のエラー（`error` はエラーコード。画面がコードで文言を出し分ける） */
export type WorkflowApiError = { error: string; status: number; message?: string };

/** 承認・却下の依頼（PATCH /api/admin/workflows/[workflowId]）。審査中であることはルートで確かめてから渡す */
export interface WorkflowDecisionInput {
  workflowRef: DocumentReference;
  workflowId: string;
  workflow: DocumentData;
  action: DecisionAction;
  uid: string;
  /** 自由記述のコメント（却下理由・内部メモ）。空なら null */
  comment: string | null;
  /** 依頼の本文（種別ごとの項目: gameId・rejectReasonCode・createdGameId・approveAction など） */
  body: Record<string, unknown>;
}

/** 成功したときの応答（`ok: true` に足す項目） */
export type WorkflowDecisionResult = { ok: true; response?: Record<string, unknown> } | WorkflowApiError;

export type WorkflowDecisionHandler = (input: WorkflowDecisionInput) => Promise<WorkflowDecisionResult>;

function toMillis(value: unknown): number {
  return (value as { toMillis?: () => number } | null | undefined)?.toMillis?.() ?? 0;
}

/**
 * 承認処理中の印（`approvingAt`）をトランザクションで取る。審査中でない、または有効な印がもうあれば false。
 * 時間のかかる承認（YouTube の取得・登録など）の前に取り、同時に承認しても二重に処理しないようにする
 */
export async function claimApproving(ref: DocumentReference, now: Date): Promise<boolean> {
  return adminDb.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data();
    if (!current || !isPendingStatus(current.status)) return false;
    if (isApprovingLocked(toMillis(current.approvingAt), now.getTime())) return false;
    tx.update(ref, { approvingAt: now });
    return true;
  });
}

/** 承認できなかったときに印を外す（審査中のまま残す） */
export async function releaseApproving(ref: DocumentReference): Promise<void> {
  await ref.update({ approvingAt: FieldValue.delete() });
}

/**
 * 状態の確定（承認・却下）と提案者への通知を、トランザクションで一度だけ書く。
 * 審査中のままであること、却下なら承認処理中の印が有効でないことを確かめてから書く（並行した承認・却下で状態と通知が食い違わないように）。
 * 書けなかったら false（ほかの操作で処理中か処理済み）
 */
export async function commitDecision(params: {
  ref: DocumentReference;
  action: DecisionAction;
  now: Date;
  /** 状態・履歴と一緒に書く項目 */
  updates?: Record<string, unknown>;
  historyEntry: Record<string, unknown>;
  notification?: Record<string, unknown> | null;
}): Promise<boolean> {
  const { ref, action, now, updates = {}, historyEntry, notification } = params;
  return adminDb.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data();
    if (!current || !isPendingStatus(current.status)) return false;
    if (action === 'reject' && isApprovingLocked(toMillis(current.approvingAt), now.getTime())) return false;
    tx.update(ref, {
      ...updates,
      status: decidedStatus(action),
      step2History: [...(current.step2History ?? []), historyEntry],
      updatedAt: now,
    });
    if (notification) tx.set(adminDb.collection('notifications').doc(), notification);
    return true;
  });
}

export const ALREADY_PROCESSED: WorkflowApiError = { error: 'already_processed', status: 409 };
