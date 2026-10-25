/**
 * 審査ワークフロー詳細のうち、ゲームタイトル登録提案（type: "game_title_register"、フェーズ7ステップ7-4）。
 * 「ゲームタイトルを登録して承認」で GameCreateModal（タイトル名入り）を開き、登録できたらその id を渡して承認する
 * （管理_審査ワークフロー仕様書 §3）。提案者には結果を通知しないため、承認後は同じ提案に付いていた再生リストを
 * そのまま登録できるよう「この再生リストも登録する」（/playlists/new?gameId=&url=）を出す。
 */
'use client';

import { useState } from 'react';
import type { DocumentData } from 'firebase/firestore';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card, CardDivider } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { ExternalLinkIcon } from '@/components/ui/icons';
import { GameCreateModal } from '@/components/games/GameCreateModal';
import {
  callWorkflowApi,
  isPendingStatus,
  WorkflowDecisionButtons,
  WorkflowDecisionModal,
  WorkflowDecisionNote,
  WorkflowHeader,
  WorkflowMemo,
  type DecisionAction,
  type WorkflowStatus,
} from './shared';

export function GameProposalDetail({ workflowId, data }: { workflowId: string; data: DocumentData }) {
  const { toast } = useToast();
  const status = (data.status as WorkflowStatus) ?? 'reviewing_lv1';
  const pending = isPendingStatus(status);
  const proposal = data.proposalData ?? {};
  const playlistUrl = (proposal.playlistUrl as string) ?? '';
  const gameTitle = (proposal.gameTitle as string) ?? '';

  const [createOpen, setCreateOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<DecisionAction | null>(null);
  // ゲーム登録は済んだが承認の記録に失敗した場合に、登録し直さず承認だけやり直せるよう保持する
  const [createdGameId, setCreatedGameId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  async function approveWith(gameId: string) {
    setApproving(true);
    try {
      await callWorkflowApi(workflowId, { action: 'approve', createdGameId: gameId, comment: null });
      toast({ type: 'success', message: 'ゲームタイトルを登録し、提案を承認しました' });
    } catch {
      toast({ type: 'error', message: '承認の記録に失敗しました。もう一度「承認する」を押してください' });
    } finally {
      setApproving(false);
    }
  }

  async function handleReject(_action: DecisionAction, comment: string | null): Promise<boolean> {
    try {
      await callWorkflowApi(workflowId, { action: 'reject', comment });
      toast({ type: 'success', message: '却下しました' });
      return true;
    } catch {
      toast({ type: 'error', message: '処理に失敗しました。時間をおいて再試行してください' });
      return false;
    }
  }

  const registeredGameId = (proposal.createdGameId as string | undefined) ?? null;

  return (
    <>
      <Card className="flex flex-col gap-4">
        <WorkflowHeader
          typeLabel="ゲームタイトル登録提案"
          submittedAt={data.submittedAt?.toMillis?.() ?? 0}
          submittedBy={data.submittedBy as string}
          status={status}
        />

        <CardDivider />

        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium text-text-primary">申請内容</p>
          <p className="text-base text-text-secondary">ゲームタイトル名: {gameTitle}</p>
          {proposal.note && <p className="whitespace-pre-wrap text-base text-text-secondary">備考: {proposal.note as string}</p>}
          <p className="text-base text-text-secondary">
            追加したい再生リスト:{' '}
            <a
              href={playlistUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 break-all text-text-tertiary underline-offset-4 hover:text-text-primary hover:underline"
            >
              {playlistUrl}
              <ExternalLinkIcon size={14} className="shrink-0" />
            </a>
          </p>
          <WorkflowDecisionNote history={data.step2History} />
          {status === 'approved' && registeredGameId && (
            <div className="mt-2 flex flex-wrap gap-3">
              <LinkButton
                href={`/playlists/new?gameId=${encodeURIComponent(registeredGameId)}&url=${encodeURIComponent(playlistUrl)}`}
                variant="primary"
                size="sm"
              >
                この再生リストも登録する
              </LinkButton>
              <LinkButton href={`/games/${registeredGameId}`} variant="secondary" size="sm">
                登録したゲームタイトルを見る
              </LinkButton>
            </div>
          )}
        </div>

        <CardDivider />

        <WorkflowMemo workflowId={workflowId} operatorMemo={(data.operatorMemo as string) ?? null} />

        {pending &&
          (createdGameId ? (
            <>
              <CardDivider />
              <div className="flex justify-end">
                <Button variant="primary" onClick={() => approveWith(createdGameId)} loading={approving}>
                  承認する
                </Button>
              </div>
            </>
          ) : (
            <WorkflowDecisionButtons
              onReject={() => setConfirmAction('reject')}
              onApprove={() => setCreateOpen(true)}
              approveLabel="ゲームタイトルを登録して承認"
            />
          ))}
      </Card>

      <GameCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultTitle={gameTitle}
        onCreated={(game) => {
          setCreatedGameId(game.id);
          void approveWith(game.id);
        }}
      />
      <WorkflowDecisionModal
        action={confirmAction}
        onClose={() => setConfirmAction(null)}
        title={{ approve: '', reject: '提案を却下しますか?' }}
        description={{ approve: '', reject: '却下すると、ゲームタイトルは登録されません。提案者には通知しません。' }}
        onSubmit={handleReject}
      />
    </>
  );
}
