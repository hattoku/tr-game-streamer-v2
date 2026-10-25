/**
 * 審査ワークフロー詳細のうち、再生リスト登録提案（type: "playlist_register"、フェーズ7ステップ7-4）。
 * 承認すると PATCH /api/admin/workflows/[workflowId] が /api/playlists/register と同じ登録処理を行い、
 * 再生リストが公開される（管理_審査ワークフロー仕様書 §3）。YouTube の状態は承認時にサーバー側で取り直すため、
 * 提案後に非公開化・別経路で登録済み、などになっていれば承認はエラーになり審査中のまま残る。
 * - ゲームタイトルは承認前に差し替えられる（§10.1 の最小版、2026-10-25 ユーザー決定）。差し替えは承認時に
 *   `gameId` として送り、サーバーが editHistory に記録する（提案内容そのものは書き換えない）。
 * - チャンネルが未登録なら、管理者の直接登録と同じく説明文（任意・手入力）を書ける。
 */
'use client';

import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card, CardDivider } from '@/components/ui/Card';
import { Field, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { ExternalLinkIcon, PencilIcon } from '@/components/ui/icons';
import { PlaylistSummary } from '@/components/playlists/PlaylistSummary';
import { GameSelectModal, type GameOption } from '@/components/playlists/GameSelectModal';
import {
  callWorkflowApi,
  isPendingStatus,
  WorkflowApiError,
  WorkflowDecisionButtons,
  WorkflowDecisionModal,
  WorkflowDecisionNote,
  WorkflowHeader,
  WorkflowMemo,
  type DecisionAction,
  type WorkflowStatus,
} from './shared';

const APPROVE_ERRORS: Record<string, string> = {
  already_registered: 'この再生リストはすでに登録されています。提案は却下してください',
  not_public: '再生リストが非公開・限定公開になっているため登録できません',
  playlist_not_found: '再生リストがYouTube上で見つかりませんでした',
  game_not_found: 'ゲームタイトルが見つかりませんでした。選び直してください',
};

export function PlaylistProposalDetail({ workflowId, data }: { workflowId: string; data: DocumentData }) {
  const { toast } = useToast();
  const status = (data.status as WorkflowStatus) ?? 'reviewing_lv1';
  const pending = isPendingStatus(status);
  const proposal = data.proposalData ?? {};
  const proposedGame = { id: (proposal.gameId as string) ?? '', title: (proposal.gameName as string) ?? '' };

  const [channelRegistered, setChannelRegistered] = useState<boolean | null>(null);
  const [channelDescription, setChannelDescription] = useState('');
  const [games, setGames] = useState<GameOption[]>([]);
  const [gameModalOpen, setGameModalOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState<{ id: string; title: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<DecisionAction | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  const game = selectedGame ?? proposedGame;
  const gameChanged = game.id !== proposedGame.id;

  useEffect(() => {
    if (!pending || !proposal.channelId) return;
    getDoc(doc(db, 'channels', proposal.channelId as string))
      .then((snap) => setChannelRegistered(snap.exists()))
      .catch(() => setChannelRegistered(true));
  }, [pending, proposal.channelId]);

  function openGameModal() {
    setGameModalOpen(true);
    if (games.length > 0) return;
    getDocs(collection(db, 'games'))
      .then((snapshot) =>
        setGames(
          snapshot.docs
            .map((d) => ({
              id: d.id,
              title: (d.data().title as string) ?? '',
              packageImageUrl: (d.data().packageImageUrl as string | undefined) ?? null,
            }))
            .sort((a, b) => a.title.localeCompare(b.title, 'ja')),
        ),
      )
      .catch((e) => console.error('games の読み込みに失敗', e));
  }

  async function handleDecision(action: DecisionAction, comment: string | null): Promise<boolean> {
    setApproveError(null);
    try {
      await callWorkflowApi(workflowId, {
        action,
        comment,
        ...(action === 'approve'
          ? { gameId: game.id, channelDescription: channelRegistered === false ? channelDescription : undefined }
          : {}),
      });
      toast({ type: 'success', message: action === 'approve' ? '承認し、再生リストを登録しました' : '却下しました' });
      return true;
    } catch (e) {
      const message = e instanceof WorkflowApiError && e.code ? APPROVE_ERRORS[e.code] : undefined;
      if (message) {
        setApproveError(message);
        toast({ type: 'error', message });
        return true; // 理由は画面に残し、ダイアログは閉じる
      }
      toast({ type: 'error', message: '処理に失敗しました。時間をおいて再試行してください' });
      return false;
    }
  }

  // 承認済みなら実際に登録したゲームタイトル（差し替えた場合は差し替え後）を出す
  const shownGameName = pending ? game.title : ((proposal.approvedGameName as string) ?? proposedGame.title);

  return (
    <>
      <Card className="flex flex-col gap-4">
        <WorkflowHeader
          typeLabel="再生リスト登録提案"
          submittedAt={data.submittedAt?.toMillis?.() ?? 0}
          submittedBy={data.submittedBy as string}
          status={status}
        />

        <CardDivider />

        <div className="flex flex-col gap-3">
          <p className="text-lg font-medium text-text-primary">申請内容</p>
          <PlaylistSummary
            title={(proposal.title as string) ?? ''}
            thumbnailUrl={(proposal.thumbnailUrl as string) ?? ''}
            channelName={(proposal.channelName as string) ?? ''}
            channelIconUrl={(proposal.channelIconUrl as string) ?? ''}
            videoCount={(proposal.itemCount as number) ?? 0}
            gameName={shownGameName}
          />
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={proposal.playlistUrl as string}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-base text-text-tertiary underline-offset-4 hover:text-text-primary hover:underline"
            >
              YouTubeで開く
              <ExternalLinkIcon size={14} />
            </a>
            {pending && (
              <Button variant="ghost" size="sm" onClick={openGameModal}>
                <PencilIcon size={14} />
                ゲームタイトルを変更
              </Button>
            )}
          </div>
          {pending && gameChanged && (
            <p className="text-md text-text-muted">
              提案時のゲームタイトル「{proposedGame.title}」から変更しています。承認すると「{game.title}」で登録します。
            </p>
          )}
          {!pending && proposal.approvedGameId && (
            <p className="text-md text-text-muted">提案時のゲームタイトル「{proposedGame.title}」から変更して登録しました。</p>
          )}
          {pending && channelRegistered === false && (
            <Field
              label="チャンネルの説明文（任意・手入力）"
              hint="未登録のチャンネルです。承認すると新規チャンネルとして登録します"
            >
              {(props) => <Textarea {...props} value={channelDescription} onChange={(e) => setChannelDescription(e.target.value)} />}
            </Field>
          )}
          {status === 'approved' && proposal.registeredPlaylistId && (
            <LinkButton href={`/playlists/${proposal.registeredPlaylistId}`} variant="secondary" size="sm" className="w-fit">
              登録した再生リストを見る
            </LinkButton>
          )}
          <WorkflowDecisionNote history={data.step2History} />
          {approveError && pending && (
            <p role="alert" className="text-md text-input-error">
              {approveError}
            </p>
          )}
        </div>

        <CardDivider />

        <WorkflowMemo workflowId={workflowId} operatorMemo={(data.operatorMemo as string) ?? null} />

        {pending && (
          <WorkflowDecisionButtons onReject={() => setConfirmAction('reject')} onApprove={() => setConfirmAction('approve')} />
        )}
      </Card>

      <GameSelectModal
        open={gameModalOpen}
        onOpenChange={setGameModalOpen}
        games={games}
        onSelect={(g) => setSelectedGame({ id: g.id, title: g.title })}
      />
      <WorkflowDecisionModal
        action={confirmAction}
        onClose={() => setConfirmAction(null)}
        title={{ approve: '提案を承認しますか?', reject: '提案を却下しますか?' }}
        description={{
          approve: `承認すると、この再生リストを「${game.title}」で登録して公開します。`,
          reject: '却下すると、再生リストは登録されません。提案者には通知しません。',
        }}
        onSubmit={handleDecision}
      />
    </>
  );
}
