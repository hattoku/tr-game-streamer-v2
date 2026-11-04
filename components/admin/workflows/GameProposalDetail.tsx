/**
 * 審査ワークフロー詳細のうち、ゲームタイトル登録提案（type: "game_title_register"、フェーズ7ステップ7-4）。
 * 「ゲームタイトルを登録して承認」で GameCreateModal（タイトル名入り）を開き、登録できたらその id を渡して承認する
 * （管理_審査ワークフロー仕様書 §3）。旧形式の提案は提案者に結果を通知しないため、承認後は同じ提案に付いていた再生リストを
 * そのまま登録できるよう「この再生リストも登録する」（/playlists/new?gameId=&url=）を出す。
 * v1.16: 登録済みでゲーム未設定の再生リストに付けたいゲームタイトルの提案（proposalData.playlistId あり）は、承認すると
 * その再生リストにゲームを付け、提案者に結果を通知する。「既存のゲームに付けて承認」（表記ゆれの別名扱いなど）も選べる。
 */
'use client';

import { useState } from 'react';
import { collection, getDocs, type DocumentData } from 'firebase/firestore';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { GameSelectModal, type GameOption } from '@/components/playlists/GameSelectModal';
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

  const targetPlaylistId = (proposal.playlistId as string | undefined) ?? null;
  const [createOpen, setCreateOpen] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const [games, setGames] = useState<GameOption[]>([]);

  async function openSelect() {
    if (games.length === 0) {
      try {
        const snap = await getDocs(collection(db, 'games'));
        setGames(
          snap.docs
            .map((d) => ({ id: d.id, title: (d.data().title as string) ?? '', packageImageUrl: (d.data().packageImageUrl as string) ?? null, aliases: (d.data().aliases as string[] | undefined) ?? [] }))
            .sort((a, b) => a.title.localeCompare(b.title, 'ja')),
        );
      } catch {
        toast({ type: 'error', message: 'ゲームの一覧を読み込めませんでした' });
        return;
      }
    }
    setSelectOpen(true);
  }
  const [confirmAction, setConfirmAction] = useState<DecisionAction | null>(null);
  // ゲーム登録は済んだが承認の記録に失敗した場合に、登録し直さず承認だけやり直せるよう保持する
  const [createdGameId, setCreatedGameId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  async function approveWith(gameId: string) {
    setApproving(true);
    try {
      await callWorkflowApi(workflowId, { action: 'approve', createdGameId: gameId, comment: null });
      toast({ type: 'success', message: 'ゲームタイトルを登録し、提案を承認しました' });
    } catch (e) {
      const code = (e as { code?: string | null }).code;
      toast({
        type: 'error',
        message:
          code === 'playlist_game_already_set'
            ? 'この再生リストには、すでに別のゲームが付いているため承認できません。却下してください'
            : '承認の記録に失敗しました。もう一度「承認する」を押してください',
      });
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
          {targetPlaylistId ? (
            <p className="text-base text-text-secondary">
              ゲームを付けたい再生リスト:{' '}
              <Link href={`/playlists/${targetPlaylistId}`} className="text-text-tertiary underline-offset-4 hover:text-text-primary hover:underline">
                {(proposal.playlistTitle as string) || targetPlaylistId}
              </Link>
            </p>
          ) : (
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
          )}
          <WorkflowDecisionNote history={data.step2History} />
          {status === 'approved' && registeredGameId && !targetPlaylistId && (
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
            <>
              {targetPlaylistId && (
                <div className="flex justify-end">
                  <Button variant="secondary" onClick={openSelect} disabled={approving}>
                    既存のゲームに付けて承認
                  </Button>
                </div>
              )}
              <WorkflowDecisionButtons
                onReject={() => setConfirmAction('reject')}
                onApprove={() => setCreateOpen(true)}
                approveLabel="ゲームタイトルを登録して承認"
              />
            </>
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
      <GameSelectModal
        open={selectOpen}
        onOpenChange={setSelectOpen}
        games={games}
        onSelect={(g) => {
          setSelectOpen(false);
          void approveWith(g.id);
        }}
      />
      <WorkflowDecisionModal
        action={confirmAction}
        onClose={() => setConfirmAction(null)}
        title={{ approve: '', reject: '提案を却下しますか?' }}
        description={{ approve: '', reject: targetPlaylistId ? '却下すると、ゲームタイトルは登録されません。提案者には見送りを通知します。' : '却下すると、ゲームタイトルは登録されません。提案者には通知しません。' }}
        onSubmit={handleReject}
      />
    </>
  );
}
