/**
 * 審査ワークフロー詳細（/admin/workflows/[workflowId]）。管理 審査ワークフロー仕様書 §5.2。
 *
 * 二段階の審査（STEP1/STEP2）・審査者一覧・AI運営者の表示は作らない（仕様書 §7）。今の状態＋「承認する」「却下する」の1段。
 * ここではワークフローを購読して種別ごとの詳細（components/admin/workflows/）に振り分けるだけ。
 * 種別を足すときは、この表と API 側の表（lib/workflow-decisions.ts）に1行ずつ足す。
 * 運営メモ・承認・却下は PATCH /api/admin/workflows/[workflowId]（lib/workflow-admin.ts の callWorkflowApi）で行う。
 */
'use client';

import { useEffect, useState } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { subscribeWorkflow, type WorkflowDoc } from '@/lib/workflow-admin';
import { GAME_PROPOSAL_TYPE, PLAYLIST_PROPOSAL_TYPE } from '@/lib/proposal-shared';
import { REVIEW_REPORT_TYPE } from '@/lib/report-reasons';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { ReportWorkflowDetail } from '@/components/admin/workflows/ReportWorkflowDetail';
import { PlaylistProposalDetail } from '@/components/admin/workflows/PlaylistProposalDetail';
import { GameProposalDetail } from '@/components/admin/workflows/GameProposalDetail';
import { ChannelApplicationDetail } from '@/components/admin/workflows/ChannelApplicationDetail';
import { CHANNEL_APPLICATION_TYPE } from '@/lib/channel-application-shared';
import { CHANGE_PROPOSAL_TYPES, isChangeProposalType } from '@/lib/change-proposal-shared';
import { ChangeProposalDetail } from '@/components/admin/workflows/ChangeProposalDetail';

const SUPPORTED_TYPES = new Set<string>([REVIEW_REPORT_TYPE, PLAYLIST_PROPOSAL_TYPE, GAME_PROPOSAL_TYPE, CHANNEL_APPLICATION_TYPE, ...CHANGE_PROPOSAL_TYPES]);

export default function AdminWorkflowDetailPage() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const router = useRouter();

  const [data, setData] = useState<WorkflowDoc | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!workflowId) return;
    return subscribeWorkflow(workflowId, (workflow) => {
      if (!workflow || !SUPPORTED_TYPES.has(workflow.type as string)) {
        setMissing(true);
        return;
      }
      setData(workflow);
    });
  }, [workflowId]);

  if (missing) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/workflows')} className="mb-3 -ml-2">
          <ChevronLeftIcon size={14} />
          一覧へ戻る
        </Button>
        <SectionHeading>審査ワークフロー詳細</SectionHeading>
      </div>

      {!data ? (
        <Card>
          <SkeletonText lines={4} />
        </Card>
      ) : data.type === PLAYLIST_PROPOSAL_TYPE ? (
        <PlaylistProposalDetail workflowId={workflowId} data={data} />
      ) : data.type === GAME_PROPOSAL_TYPE ? (
        <GameProposalDetail workflowId={workflowId} data={data} />
      ) : isChangeProposalType(data.type) ? (
        <ChangeProposalDetail workflowId={workflowId} data={data} />
      ) : data.type === CHANNEL_APPLICATION_TYPE ? (
        <ChannelApplicationDetail workflowId={workflowId} data={data} />
      ) : (
        <ReportWorkflowDetail workflowId={workflowId} data={data} />
      )}
    </div>
  );
}
