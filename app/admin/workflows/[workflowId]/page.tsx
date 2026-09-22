/**
 * 審査ワークフロー詳細（/admin/workflows/[workflowId]）。管理_審査ワークフロー仕様書 §8-9,11 準拠。
 *
 * フェーズ6ステップ3の決定（operator/owner共通・提案は対象外）により、以下を簡略化する:
 * - STEP1/STEP2の二段階審査フロー・審査者一覧・AI運営者表示は作らない（AI運営者・ジャンル別
 *   アサインが未実装のため）。現在ステータス＋「承認する」「却下する」の単一ステップとする。
 * - 対象typeは`review_report`のみ（他typeの投稿経路が無いため）。
 * 運営メモ・承認・却下はいずれも管理者の書き込みをAdmin SDK経由に寄せる既存方針
 * （app/api/admin/channels/[channelId]/route.ts と同じ）に合わせ、API Route（PATCH）で行う。
 */
'use client';

import { useEffect, useState } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { reportReasonLabel } from '@/lib/report-reasons';
import { Card, CardDivider, SectionHeading } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { StarRating } from '@/components/ui/StarRating';
import { Tag } from '@/components/ui/Tag';
import { useToast } from '@/components/ui/Toast';
import { ChevronLeftIcon } from '@/components/ui/icons';

type WorkflowStatus = 'reviewing_lv1' | 'reviewing_lv2' | 'approved' | 'rejected';

interface WorkflowDetail {
  status: WorkflowStatus;
  reason: string | null;
  detail: string | null;
  reviewId: string;
  playlistId: string;
  operatorMemo: string | null;
  submittedAt: number;
}

interface TargetReview {
  comment: string | null;
  starRating: number | null;
  userDisplayName: string;
}

const MAX_MEMO_LENGTH = 1000;

export default function AdminWorkflowDetailPage() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(null);
  const [targetReview, setTargetReview] = useState<TargetReview | null | undefined>(undefined);

  const [memoDraft, setMemoDraft] = useState('');
  const [memoEditing, setMemoEditing] = useState(false);
  const [memoSaving, setMemoSaving] = useState(false);

  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!workflowId) return;
    return onSnapshot(doc(db, 'workflows', workflowId), (snap) => {
      if (!snap.exists() || snap.data().type !== 'review_report') {
        setMissing(true);
        return;
      }
      const data = snap.data();
      setWorkflow({
        status: (data.status as WorkflowStatus) ?? 'reviewing_lv1',
        reason: (data.reportData?.reason as string) ?? null,
        detail: (data.reportData?.detail as string) ?? null,
        reviewId: (data.reportData?.reviewId as string) ?? '',
        playlistId: (data.reportData?.playlistId as string) ?? '',
        operatorMemo: (data.operatorMemo as string) ?? null,
        submittedAt: data.submittedAt?.toMillis?.() ?? 0,
      });
    });
  }, [workflowId]);

  useEffect(() => {
    if (!workflow?.playlistId) return;
    getDoc(doc(db, 'playlists', workflow.playlistId)).then((snap) => {
      setPlaylistTitle((snap.data()?.title as string) ?? '(削除済みの再生リスト)');
    });
  }, [workflow?.playlistId]);

  useEffect(() => {
    if (!workflow?.reviewId) return;
    getDoc(doc(db, 'reviews', workflow.reviewId)).then((snap) => {
      if (!snap.exists()) {
        setTargetReview(null);
        return;
      }
      const data = snap.data();
      setTargetReview({
        comment: (data.comment as string) ?? null,
        starRating: (data.starRating as number) ?? null,
        userDisplayName: (data.userDisplayName as string) ?? 'ユーザー',
      });
    });
  }, [workflow?.reviewId]);

  if (missing) notFound();

  async function callWorkflowApi(body: Record<string, unknown>) {
    const idToken = await auth.currentUser?.getIdToken();
    const res = await fetch(`/api/admin/workflows/${encodeURIComponent(workflowId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
  }

  function startMemoEdit() {
    setMemoDraft(workflow?.operatorMemo ?? '');
    setMemoEditing(true);
  }

  async function saveMemo() {
    if (memoSaving) return;
    setMemoSaving(true);
    try {
      await callWorkflowApi({ action: 'update_memo', operatorMemo: memoDraft });
      toast({ type: 'success', message: '運営メモを保存しました' });
      setMemoEditing(false);
    } catch {
      toast({ type: 'error', message: '保存に失敗しました。時間をおいて再試行してください' });
    } finally {
      setMemoSaving(false);
    }
  }

  async function handleConfirmSubmit() {
    if (!confirmAction || submitting) return;
    if (confirmAction === 'reject' && !comment.trim()) return;
    setSubmitting(true);
    try {
      await callWorkflowApi({ action: confirmAction, comment: comment.trim() || null });
      toast({ type: 'success', message: confirmAction === 'approve' ? '承認しました' : '却下しました' });
      setConfirmAction(null);
      setComment('');
    } catch {
      toast({ type: 'error', message: '処理に失敗しました。時間をおいて再試行してください' });
    } finally {
      setSubmitting(false);
    }
  }

  if (!workflow) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <SkeletonText lines={4} />
        </Card>
      </div>
    );
  }

  const isPending = workflow.status === 'reviewing_lv1' || workflow.status === 'reviewing_lv2';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/workflows')} className="mb-3 -ml-2">
          <ChevronLeftIcon size={14} />
          一覧へ戻る
        </Button>
        <SectionHeading>審査ワークフロー詳細</SectionHeading>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-md text-text-tertiary">審査種別: レビューコメント通報</p>
            <p className="text-md text-text-tertiary">提出日時: {workflow.submittedAt ? new Date(workflow.submittedAt).toLocaleString('ja-JP') : '-'}</p>
          </div>
          <Tag emphasis={isPending}>
            {workflow.status === 'approved' ? '承認' : workflow.status === 'rejected' ? '却下' : '審査中'}
          </Tag>
        </div>

        <CardDivider />

        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium text-text-primary">申請内容</p>
          <p className="text-base text-text-secondary">通報理由: {reportReasonLabel(workflow.reason)}</p>
          {workflow.detail && <p className="whitespace-pre-wrap text-base text-text-secondary">詳細: {workflow.detail}</p>}
          <div className="text-base text-text-secondary">
            対象再生リスト:{' '}
            {playlistTitle === null ? (
              <Skeleton className="inline-block h-5 w-32 align-middle" />
            ) : (
              <Tag href={`/playlists/${workflow.playlistId}`}>{playlistTitle}</Tag>
            )}
          </div>
        </div>

        <CardDivider />

        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium text-text-primary">通報対象のレビュー</p>
          {targetReview === undefined ? (
            <SkeletonText lines={2} />
          ) : targetReview === null ? (
            <p className="text-base text-text-muted">対象レビューは既に削除されています</p>
          ) : (
            <div className="flex flex-col gap-1 rounded-[8px] bg-bg-hover px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-base text-text-primary">{targetReview.userDisplayName}</span>
                {targetReview.starRating != null && <StarRating value={targetReview.starRating} readOnly size={14} />}
              </div>
              {targetReview.comment && <p className="whitespace-pre-wrap text-base text-text-secondary">{targetReview.comment}</p>}
            </div>
          )}
        </div>

        <CardDivider />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-lg font-medium text-text-primary">運営メモ</p>
            {!memoEditing && (
              <Button variant="ghost" size="sm" onClick={startMemoEdit}>
                編集する
              </Button>
            )}
          </div>
          {memoEditing ? (
            <div className="flex flex-col gap-2">
              <Field label={`運営メモ（${memoDraft.length}/${MAX_MEMO_LENGTH}）`}>
                {(props) => (
                  <Textarea
                    {...props}
                    value={memoDraft}
                    onChange={(e) => setMemoDraft(e.target.value.slice(0, MAX_MEMO_LENGTH))}
                    disabled={memoSaving}
                    rows={3}
                  />
                )}
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setMemoEditing(false)} disabled={memoSaving}>
                  キャンセル
                </Button>
                <Button variant="primary" size="sm" onClick={saveMemo} loading={memoSaving}>
                  保存する
                </Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-base text-text-secondary">{workflow.operatorMemo || '（未記入）'}</p>
          )}
        </div>

        {isPending && (
          <>
            <CardDivider />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setConfirmAction('reject')}>
                却下する
              </Button>
              <Button variant="primary" onClick={() => setConfirmAction('approve')}>
                承認する
              </Button>
            </div>
          </>
        )}
      </Card>

      <Modal
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
            setComment('');
          }
        }}
        title={confirmAction === 'approve' ? '通報を承認しますか?' : '通報を却下しますか?'}
        description={
          confirmAction === 'approve'
            ? '承認すると、対象のレビューコメントは削除されます。'
            : '却下すると、対象のレビューコメントはそのまま掲載が継続されます。'
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={confirmAction === 'approve' ? 'コメント（任意）' : '却下理由（必須）'}>
            {(props) => <Textarea {...props} value={comment} onChange={(e) => setComment(e.target.value)} disabled={submitting} rows={3} />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmAction(null)} disabled={submitting}>
              キャンセル
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmSubmit}
              loading={submitting}
              disabled={confirmAction === 'reject' && !comment.trim()}
            >
              {confirmAction === 'approve' ? '承認する' : '却下する'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
