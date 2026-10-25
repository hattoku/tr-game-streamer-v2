/**
 * 審査ワークフロー詳細のうち、レビューコメント通報（type: "review_report"、フェーズ6ステップ3）。
 * 承認すると対象レビューを論理削除（非表示化）する（管理_審査ワークフロー仕様書 §3.1）。
 */
'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { reportReasonLabel } from '@/lib/report-reasons';
import { Card, CardDivider } from '@/components/ui/Card';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { StarRating } from '@/components/ui/StarRating';
import { Tag } from '@/components/ui/Tag';
import { useToast } from '@/components/ui/Toast';
import {
  callWorkflowApi,
  isPendingStatus,
  WorkflowDecisionButtons,
  WorkflowDecisionModal,
  WorkflowHeader,
  WorkflowMemo,
  type DecisionAction,
  type WorkflowStatus,
} from './shared';

interface TargetReview {
  comment: string | null;
  starRating: number | null;
  userDisplayName: string;
  isHidden?: boolean;
}

export function ReportWorkflowDetail({ workflowId, data }: { workflowId: string; data: DocumentData }) {
  const { toast } = useToast();
  const status = (data.status as WorkflowStatus) ?? 'reviewing_lv1';
  const reason = (data.reportData?.reason as string) ?? null;
  const detail = (data.reportData?.detail as string) ?? null;
  const reviewId = (data.reportData?.reviewId as string) ?? '';
  const playlistId = (data.reportData?.playlistId as string) ?? '';
  const snapshot = data.reportData?.hiddenReviewSnapshot;
  /** 承認時に退避したレビュー内容（審査ワークフロー仕様書 §3.1）。投稿者が後で削除しても残る */
  const hiddenSnapshot: TargetReview | null = snapshot
    ? {
        comment: (snapshot.comment as string) ?? null,
        starRating: (snapshot.starRating as number) ?? null,
        userDisplayName: (snapshot.userDisplayName as string) ?? 'ユーザー',
      }
    : null;

  const [playlistTitle, setPlaylistTitle] = useState<string | null>(null);
  const [targetReview, setTargetReview] = useState<TargetReview | null | undefined>(undefined);
  const [confirmAction, setConfirmAction] = useState<DecisionAction | null>(null);

  useEffect(() => {
    if (!playlistId) return;
    getDoc(doc(db, 'playlists', playlistId)).then((snap) => {
      setPlaylistTitle((snap.data()?.title as string) ?? '(削除済みの再生リスト)');
    });
  }, [playlistId]);

  useEffect(() => {
    if (!reviewId) return;
    // 承認で isHidden が立つのを即時に反映するため購読する
    return onSnapshot(doc(db, 'reviews', reviewId), (snap) => {
      if (!snap.exists()) {
        setTargetReview(null);
        return;
      }
      const review = snap.data();
      setTargetReview({
        comment: (review.comment as string) ?? null,
        starRating: (review.starRating as number) ?? null,
        userDisplayName: (review.userDisplayName as string) ?? 'ユーザー',
        isHidden: review.isHidden === true,
      });
    });
  }, [reviewId]);

  async function handleDecision(action: DecisionAction, comment: string | null): Promise<boolean> {
    try {
      await callWorkflowApi(workflowId, { action, comment });
      toast({ type: 'success', message: action === 'approve' ? '承認しました' : '却下しました' });
      return true;
    } catch {
      toast({ type: 'error', message: '処理に失敗しました。時間をおいて再試行してください' });
      return false;
    }
  }

  return (
    <>
      <Card className="flex flex-col gap-4">
        <WorkflowHeader typeLabel="レビューコメント通報" submittedAt={data.submittedAt?.toMillis?.() ?? 0} status={status} />

        <CardDivider />

        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium text-text-primary">申請内容</p>
          <p className="text-base text-text-secondary">通報理由: {reportReasonLabel(reason)}</p>
          {detail && <p className="whitespace-pre-wrap text-base text-text-secondary">詳細: {detail}</p>}
          <div className="text-base text-text-secondary">
            対象再生リスト:{' '}
            {playlistTitle === null ? (
              <Skeleton className="inline-block h-5 w-32 align-middle" />
            ) : (
              <Tag href={`/playlists/${playlistId}`}>{playlistTitle}</Tag>
            )}
          </div>
        </div>

        <CardDivider />

        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium text-text-primary">通報対象のレビュー</p>
          {targetReview === undefined ? (
            <SkeletonText lines={2} />
          ) : (
            (() => {
              // 承認済みなら承認時点の内容（退避分）を出す。投稿者が後で削除・書き直していても審査した内容が分かるように
              const shown = hiddenSnapshot ?? targetReview;
              if (!shown) return <p className="text-base text-text-muted">対象レビューは既に削除されています</p>;
              return (
                <>
                  {hiddenSnapshot && (
                    <p className="text-md text-text-muted">
                      {targetReview?.isHidden
                        ? '非表示中（承認時点の内容）'
                        : '承認時点の内容。投稿者がレビューを削除したため、現在は非表示が解除されています'}
                    </p>
                  )}
                  <div className="flex flex-col gap-1 rounded-[8px] bg-bg-hover px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base text-text-primary">{shown.userDisplayName}</span>
                      {shown.starRating != null && <StarRating value={shown.starRating} readOnly size={14} />}
                    </div>
                    {shown.comment && <p className="whitespace-pre-wrap text-base text-text-secondary">{shown.comment}</p>}
                  </div>
                </>
              );
            })()
          )}
        </div>

        <CardDivider />

        <WorkflowMemo workflowId={workflowId} operatorMemo={(data.operatorMemo as string) ?? null} />

        {isPendingStatus(status) && (
          <WorkflowDecisionButtons onReject={() => setConfirmAction('reject')} onApprove={() => setConfirmAction('approve')} />
        )}
      </Card>

      <WorkflowDecisionModal
        action={confirmAction}
        onClose={() => setConfirmAction(null)}
        title={{ approve: '通報を承認しますか?', reject: '通報を却下しますか?' }}
        description={{
          approve: '承認すると、対象のレビューは非表示になります（内容は審査記録に残ります）。',
          reject: '却下すると、対象のレビューコメントはそのまま掲載が継続されます。',
        }}
        onSubmit={handleDecision}
      />
    </>
  );
}
