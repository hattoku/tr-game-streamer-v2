/**
 * 審査ワークフロー詳細（/admin/workflows/[workflowId]）。管理_審査ワークフロー仕様書 §8-9,11 準拠。
 *
 * フェーズ6ステップ3の決定（operator/owner共通）により、以下を簡略化する:
 * - STEP1/STEP2の二段階審査フロー・審査者一覧・AI運営者表示は作らない（AI運営者・ジャンル別
 *   アサインが未実装のため）。現在ステータス＋「承認する」「却下する」の単一ステップとする。
 * 対象typeは通報（`review_report`）と提案（`playlist_register`・`game_title_register`、フェーズ7ステップ7-4）。
 * ここではワークフローを購読して種別ごとの詳細（components/admin/workflows/）に振り分けるだけ。
 * 運営メモ・承認・却下はいずれも管理者の書き込みをAdmin SDK経由に寄せる既存方針
 * （app/api/admin/channels/[channelId]/route.ts と同じ）に合わせ、API Route（PATCH）で行う。
 */
'use client';

import { useEffect, useState } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GAME_PROPOSAL_TYPE, PLAYLIST_PROPOSAL_TYPE } from '@/lib/proposal-shared';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { ReportWorkflowDetail } from '@/components/admin/workflows/ReportWorkflowDetail';
import { PlaylistProposalDetail } from '@/components/admin/workflows/PlaylistProposalDetail';
import { GameProposalDetail } from '@/components/admin/workflows/GameProposalDetail';

const SUPPORTED_TYPES = new Set(['review_report', PLAYLIST_PROPOSAL_TYPE, GAME_PROPOSAL_TYPE]);

export default function AdminWorkflowDetailPage() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const router = useRouter();

  const [data, setData] = useState<DocumentData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!workflowId) return;
    return onSnapshot(doc(db, 'workflows', workflowId), (snap) => {
      if (!snap.exists() || !SUPPORTED_TYPES.has(snap.data().type as string)) {
        setMissing(true);
        return;
      }
      setData(snap.data());
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
      ) : (
        <ReportWorkflowDetail workflowId={workflowId} data={data} />
      )}
    </div>
  );
}
