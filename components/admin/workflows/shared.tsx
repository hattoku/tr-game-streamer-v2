/**
 * 審査ワークフロー詳細（/admin/workflows/[workflowId]）の種別共通部品（管理_審査ワークフロー仕様書 §8・§9・§11）。
 * 通報（ReportWorkflowDetail）と提案（PlaylistProposalDetail・GameProposalDetail）で共用する。
 * 書き込みはすべて PATCH /api/admin/workflows/[workflowId]（Admin SDK）経由。
 */
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/Button';
import { CardDivider } from '@/components/ui/Card';
import { Field, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Tag } from '@/components/ui/Tag';
import { useToast } from '@/components/ui/Toast';

export type WorkflowStatus = 'reviewing_lv1' | 'reviewing_lv2' | 'approved' | 'rejected';
export type DecisionAction = 'approve' | 'reject';

const MAX_MEMO_LENGTH = 1000;

export function isPendingStatus(status: WorkflowStatus): boolean {
  return status === 'reviewing_lv1' || status === 'reviewing_lv2';
}

/** API のエラーコード（`error`）を持つ例外。呼び出し側で文言を出し分ける */
export class WorkflowApiError extends Error {
  constructor(readonly code: string | null, readonly status: number) {
    super(`workflow api ${status} ${code ?? ''}`);
  }
}

export async function callWorkflowApi(workflowId: string, body: Record<string, unknown>): Promise<void> {
  const idToken = await auth.currentUser?.getIdToken();
  const res = await fetch(`/api/admin/workflows/${encodeURIComponent(workflowId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new WorkflowApiError((json.error as string) ?? null, res.status);
  }
}

/** 種別・提出日時・提出者・ステータスの見出し部分 */
export function WorkflowHeader({
  typeLabel,
  submittedAt,
  submittedBy,
  status,
}: {
  typeLabel: string;
  submittedAt: number;
  /** 提案のみ表示する（通報は通報者を出さない既存の画面を踏襲） */
  submittedBy?: string;
  status: WorkflowStatus;
}) {
  const [submitterName, setSubmitterName] = useState<string | null>(null);
  useEffect(() => {
    if (!submittedBy) return;
    getDoc(doc(db, 'users', submittedBy))
      .then((snap) => setSubmitterName((snap.data()?.displayName as string) ?? '(退会したユーザー)'))
      .catch(() => setSubmitterName('(取得できませんでした)'));
  }, [submittedBy]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-md text-text-tertiary">審査種別: {typeLabel}</p>
        <p className="text-md text-text-tertiary">提出日時: {submittedAt ? new Date(submittedAt).toLocaleString('ja-JP') : '-'}</p>
        {submittedBy && <p className="text-md text-text-tertiary">提出者: {submitterName ?? '…'}</p>}
      </div>
      <Tag emphasis={isPendingStatus(status)}>{status === 'approved' ? '承認' : status === 'rejected' ? '却下' : '審査中'}</Tag>
    </div>
  );
}

/** 承認・却下の履歴（step2History）のうち最新の1件。却下理由・承認コメントを残った記録として見せる */
export function WorkflowDecisionNote({
  history,
  rejectLabel = '却下理由',
}: {
  history: Array<{ action?: string; comment?: string | null }> | undefined;
  /** 却下時の自由記述の見出し（再生リスト登録提案は定型理由とは別の内部メモのため差し替える） */
  rejectLabel?: string;
}) {
  const last = history?.[history.length - 1];
  if (!last?.comment) return null;
  return (
    <p className="whitespace-pre-wrap text-base text-text-secondary">
      {last.action === 'rejected' ? rejectLabel : '承認コメント'}: {last.comment}
    </p>
  );
}

/** 運営メモ（§11、1,000文字上限） */
export function WorkflowMemo({ workflowId, operatorMemo }: { workflowId: string; operatorMemo: string | null }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await callWorkflowApi(workflowId, { action: 'update_memo', operatorMemo: draft });
      toast({ type: 'success', message: '運営メモを保存しました' });
      setEditing(false);
    } catch {
      toast({ type: 'error', message: '保存に失敗しました。時間をおいて再試行してください' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-lg font-medium text-text-primary">運営メモ</p>
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(operatorMemo ?? '');
              setEditing(true);
            }}
          >
            編集する
          </Button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Field label={`運営メモ（${draft.length}/${MAX_MEMO_LENGTH}）`}>
            {(props) => (
              <Textarea {...props} value={draft} onChange={(e) => setDraft(e.target.value.slice(0, MAX_MEMO_LENGTH))} disabled={saving} rows={3} />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              キャンセル
            </Button>
            <Button variant="primary" size="sm" onClick={save} loading={saving}>
              保存する
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-base text-text-secondary">{operatorMemo || '（未記入）'}</p>
      )}
    </div>
  );
}

/** 審査中のときだけ出す「却下する」「承認する」ボタン行 */
export function WorkflowDecisionButtons({
  onReject,
  onApprove,
  approveLabel = '承認する',
  disabled = false,
}: {
  onReject: () => void;
  onApprove: () => void;
  approveLabel?: string;
  /** 承認処理の実行中など、押させたくない間は true */
  disabled?: boolean;
}) {
  return (
    <>
      <CardDivider />
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onReject} disabled={disabled}>
          却下する
        </Button>
        <Button variant="primary" onClick={onApprove} disabled={disabled}>
          {approveLabel}
        </Button>
      </div>
    </>
  );
}

/**
 * 承認・却下の確認ダイアログ（§9.1 承認はコメント任意・§9.2 却下は理由必須）。
 * `onSubmit` が例外を投げなければ閉じる（エラー表示は呼び出し側）。
 * `rejectReasons` を渡すと（再生リスト登録提案、§14.4）、却下は定型理由の選択が必須になり、自由記述は任意の内部メモになる
 * （選んだ定型理由は提案者に見せる。自由記述は見せない）。
 */
export function WorkflowDecisionModal({
  action,
  onClose,
  title,
  description,
  onSubmit,
  rejectReasons,
}: {
  action: DecisionAction | null;
  onClose: () => void;
  title: Record<DecisionAction, string>;
  description: Record<DecisionAction, ReactNode>;
  onSubmit: (action: DecisionAction, comment: string | null, rejectReasonCode: string | null) => Promise<boolean>;
  rejectReasons?: ReadonlyArray<{ code: string; label: string }>;
}) {
  const [comment, setComment] = useState('');
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const usesReasons = action === 'reject' && !!rejectReasons;
  const canSubmit = action === 'approve' || (usesReasons ? !!reasonCode : !!comment.trim());

  function close() {
    setComment('');
    setReasonCode(null);
    onClose();
  }

  async function handleSubmit() {
    if (!action || submitting || !canSubmit) return;
    setSubmitting(true);
    try {
      const ok = await onSubmit(action, comment.trim() || null, usesReasons ? reasonCode : null);
      if (ok) close();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={action !== null}
      onOpenChange={(open) => {
        if (!open && !submitting) close();
      }}
      title={action ? title[action] : ''}
      description={action ? description[action] : undefined}
    >
      <div className="flex flex-col gap-4">
        {usesReasons && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-md text-text-tertiary">見送り理由（必須・提案者に表示されます）</legend>
            {rejectReasons!.map((r) => (
              <label key={r.code} className="flex cursor-pointer items-start gap-2 text-base text-text-secondary">
                <input
                  type="radio"
                  name="reject-reason"
                  value={r.code}
                  checked={reasonCode === r.code}
                  onChange={() => setReasonCode(r.code)}
                  disabled={submitting}
                  className="mt-[3px]"
                />
                <span>{r.label}</span>
              </label>
            ))}
          </fieldset>
        )}
        <Field label={action === 'approve' ? 'コメント（任意）' : usesReasons ? '内部メモ（任意・提案者には表示されません）' : '却下理由（必須）'}>
          {(props) => <Textarea {...props} value={comment} onChange={(e) => setComment(e.target.value)} disabled={submitting} rows={3} />}
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={submitting}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting} disabled={!canSubmit}>
            {action === 'approve' ? '承認する' : '却下する'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
