/**
 * 審査ワークフロー詳細のうち、再生リスト登録提案（type: "playlist_register"、フェーズ7ステップ7-4）。
 * 承認すると PATCH /api/admin/workflows/[workflowId] が /api/playlists/register と同じ登録処理を行い、
 * 再生リストが公開される（管理 審査ワークフロー仕様書 §4.2）。YouTube の状態は承認時にサーバー側で取り直すため、
 * 提案後に非公開化・別経路で登録済み、などになっていれば承認はエラーになり審査中のまま残る。
 * - ゲームタイトルは承認前に差し替えられる（審査ワークフロー仕様書 §4.2、2026-10-25 ユーザー決定）。差し替えは承認時に
 *   `gameId` として送り、サーバーが editHistory に記録する（提案内容そのものは書き換えない）。
 * - チャンネルが未登録なら、管理者の直接登録と同じく説明文（任意・手入力）を書ける。
 * - 提案者がゲームタイトルを候補から選べず新しいゲームタイトル名を入力した提案（proposalData.gameId が null、審査ワークフロー仕様書 §4.2）は、
 *   審査は「① ゲームタイトルを決める → ② 承認・却下」の2段で見せる（2026-10-26 ユーザー指摘で、登録と承認を一度に行う
 *   ボタンをやめた）。①で「新しく登録する」（GameCreateModal、タイトル名入り）か「既存のゲームタイトルから選ぶ」を選び、
 *   決まるまで承認ボタンは押せない（却下はいつでも押せる）。登録しただけでは承認しない。
 *   ゲームタイトルの登録後に再生リストの登録だけ失敗して画面を開き直した場合は、同じ名前のゲームタイトルを自動で選ぶ
 *   （ゲームタイトルを二重に登録させない）。
 * - 動画一覧（GET /api/admin/workflows/[id]/videos）を画面内に出し、YouTube へ移らずに中身を確かめられる（審査ワークフロー仕様書 §4.2）。
 * - 却下は定型の見送り理由（PROPOSAL_REJECT_REASONS）が必須で、自由記述は内部メモ（審査ワークフロー仕様書 §4.2）。提案者には API が審査結果を通知する。
 * - 提案に楽天ブックスの商品（proposalData.newGameRakuten）や機種（newGamePlatforms）があれば、登録モーダルにそれを入れて開く（審査ワークフロー仕様書 §4.2）。
 */
'use client';

import { useEffect, useState } from 'react';
import { fetchGameOptions } from '@/lib/admin-reads';
import { callWorkflowApi, channelPageExists, fetchPlaylistGameName, findGameByTitle, type WorkflowDoc } from '@/lib/workflow-admin';
import { isPendingStatus, type DecisionAction, type WorkflowStatus } from '@/lib/workflow-shared';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card, CardDivider } from '@/components/ui/Card';
import { Field, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { CheckIcon, ExternalLinkIcon, PencilIcon } from '@/components/ui/icons';
import { PlaylistSummary } from '@/components/playlists/PlaylistSummary';
import { GameSelectModal, type GameOption } from '@/components/playlists/GameSelectModal';
import { GameCreateModal } from '@/components/games/GameCreateModal';
import { ProposalVideoList } from './ProposalVideoList';
import {
  workflowErrorMessage,
  WorkflowDecisionButtons,
  WorkflowDecisionModal,
  WorkflowDecisionNote,
  WorkflowHeader,
  WorkflowMemo,
} from './shared';
import { PROPOSAL_REJECT_REASONS, proposalRejectReasonLabel, type ProposalRakutenItem } from '@/lib/proposal-shared';

const APPROVE_ERRORS: Record<string, string> = {
  already_registered: 'この再生リストはすでに登録されています。提案は却下してください',
  not_public: '再生リストが非公開・限定公開になっているため登録できません',
  playlist_not_found: '再生リストがYouTube上で見つかりませんでした',
  game_not_found: 'ゲームタイトルが見つかりませんでした。選び直してください',
  game_required: 'ゲームタイトルを登録するか、選んでから承認してください',
  channel_not_listed: 'このチャンネルは掲載チャンネルではなくなったため承認できません。提案は却下してください',
  already_processed: 'ほかの操作で処理中か、すでに処理済みです。画面を再読み込みして確認してください',
  hidden_by_admin: 'この再生リストは運営が非表示にしたため承認できません。公開する場合は収集の画面から掲載してください',
  quota_exceeded: 'YouTubeの取得上限に達しました。時間をおいて再試行してください',
};

/** 提案時点の掲載状態の表示（審査ワークフロー仕様書 §4.2） */
const LISTING_STATUS_LABEL: Record<string, string> = {
  unconfirmed: '未確認',
  non_game: 'ゲーム以外と判定',
  too_short: '本数不足',
  excluded: '除外',
};

export function PlaylistProposalDetail({ workflowId, data }: { workflowId: string; data: WorkflowDoc }) {
  const { toast } = useToast();
  const status = (data.status as WorkflowStatus) ?? 'reviewing_lv1';
  const pending = isPendingStatus(status);
  const proposal = data.proposalData ?? {};
  const proposedGame = { id: (proposal.gameId as string) ?? '', title: (proposal.gameName as string) ?? '' };
  /** 新しいゲームタイトルとして提案された名前（既存のゲームタイトルを選んだ提案では null） */
  const newGameTitle = (proposal.newGameTitle as string | undefined) ?? null;
  const newGameNote = (proposal.newGameNote as string | undefined) ?? null;
  const newGamePlatforms = (proposal.newGamePlatforms as string[] | undefined) ?? [];
  const newGameRakuten = (proposal.newGameRakuten as ProposalRakutenItem | null | undefined) ?? null;

  const [channelRegistered, setChannelRegistered] = useState<boolean | null>(null);
  const [channelDescription, setChannelDescription] = useState('');
  const [games, setGames] = useState<GameOption[]>([]);
  const [gameModalOpen, setGameModalOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState<{ id: string; title: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<DecisionAction | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  /** 承認・却下の API 実行中（ボタンの二重押し防止） */
  const [deciding, setDeciding] = useState(false);
  /** 提案された新しいゲームタイトルが登録済みだったため自動で選んだ */
  const [autoSelectedExisting, setAutoSelectedExisting] = useState(false);

  /** ゲームが分からないとして送られた提案（ページ 提案する 仕様書 §5.4）。ゲームを決めずに承認できる */
  const noGame = proposal.noGame === true;
  /** すでにプレミテにある、掲載していない再生リストの提案（審査ワークフロー仕様書 §4.2） */
  const existingListingStatus = (proposal.existingListingStatus as string | undefined) ?? null;
  const proposeReason = (proposal.proposeReason as string | null | undefined) ?? null;
  /** すでにある再生リストに今付いているゲーム（巡回の推定など）。ゲームを選ばずに承認するとこのまま */
  const [currentGameName, setCurrentGameName] = useState<string | null>(null);
  const game = selectedGame ?? proposedGame;
  const gameChanged = game.id !== proposedGame.id;
  /** まだゲームタイトルが決まっていない（新しいゲームタイトル付きの提案で、登録も選択もしていない） */
  const needsGame = !game.id && !!newGameTitle;

  useEffect(() => {
    if (!pending || !existingListingStatus || !proposal.youtubePlaylistId) return;
    fetchPlaylistGameName(proposal.youtubePlaylistId as string)
      .then(setCurrentGameName)
      .catch(() => setCurrentGameName(null));
  }, [pending, existingListingStatus, proposal.youtubePlaylistId]);

  useEffect(() => {
    if (!pending || !proposal.channelId) return;
    channelPageExists(proposal.channelId as string)
      .then(setChannelRegistered)
      .catch(() => setChannelRegistered(true));
  }, [pending, proposal.channelId]);

  // ゲームタイトルだけ登録して承認せずに画面を開き直した場合など、提案された名前のゲームタイトルがすでにあればそれを選んでおく
  const proposedGameId = proposal.gameId as string | null | undefined;
  useEffect(() => {
    if (!pending || proposedGameId || !newGameTitle) return;
    findGameByTitle(newGameTitle)
      .then((existing) => {
        if (!existing) return;
        setSelectedGame((prev) => prev ?? existing);
        setAutoSelectedExisting(true);
      })
      .catch((e) => console.error('games の読み込みに失敗', e));
  }, [pending, proposedGameId, newGameTitle]);

  function openGameModal() {
    setGameModalOpen(true);
    if (games.length > 0) return;
    fetchGameOptions()
      .then(setGames)
      .catch((e) => console.error('games の読み込みに失敗', e));
  }

  async function handleDecision(
    action: DecisionAction,
    comment: string | null,
    { gameId = game.id || undefined, rejectReasonCode = null }: { gameId?: string; rejectReasonCode?: string | null } = {},
  ): Promise<boolean> {
    setApproveError(null);
    setDeciding(true);
    try {
      await callWorkflowApi(workflowId, {
        action,
        comment,
        ...(action === 'approve'
          ? { gameId, channelDescription: channelRegistered === false ? channelDescription : undefined }
          : { rejectReasonCode }),
      });
      toast({ type: 'success', message: action === 'approve' ? '承認し、再生リストを登録しました' : '却下しました' });
      return true;
    } catch (e) {
      const message = workflowErrorMessage(e, APPROVE_ERRORS);
      if (message) {
        setApproveError(message);
        toast({ type: 'error', message });
        return true; // 理由は画面に残し、ダイアログは閉じる
      }
      toast({ type: 'error', message: '処理に失敗しました。時間をおいて再試行してください' });
      return false;
    } finally {
      setDeciding(false);
    }
  }

  // 承認済みなら実際に登録したゲームタイトル（差し替えた場合は差し替え後）を出す
  const shownGameName = pending
    ? game.title || (newGameTitle ? `${newGameTitle}（新しいゲームタイトル・未登録）` : '')
    : ((proposal.approvedGameName as string) ?? proposedGame.title);
  /** ゲームを選ばずに承認したときの扱い（ゲーム未設定、すでにある再生リストは今のゲームのまま） */
  const noGameApproveLabel = currentGameName ? `今のゲーム「${currentGameName}」のまま` : 'ゲーム未設定で';

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
          </div>
          {newGameTitle && (
            <div className="flex flex-col gap-1 rounded-[8px] bg-bg-child px-3 py-2">
              <p className="text-base text-text-primary">新しいゲームタイトルとして提案: {newGameTitle}</p>
              {newGamePlatforms.length > 0 && <p className="text-base text-text-secondary">機種: {newGamePlatforms.join('、')}</p>}
              {newGameRakuten && (
                <p className="text-base text-text-secondary">
                  楽天ブックスの候補から選択:{' '}
                  <a
                    href={newGameRakuten.itemUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-[3px] hover:text-text-primary"
                  >
                    {newGameRakuten.title}
                  </a>
                </p>
              )}
              {newGameNote && <p className="whitespace-pre-wrap text-base text-text-secondary">備考: {newGameNote}</p>}
            </div>
          )}
          {existingListingStatus && (
            <div className="flex flex-col gap-1 rounded-[8px] bg-bg-child px-3 py-2" data-testid="proposal-existing-playlist">
              <p className="text-base text-text-primary">
                プレミテにある、まだ公開していない再生リストの公開の提案です（提案時の状態: {LISTING_STATUS_LABEL[existingListingStatus] ?? existingListingStatus}
                {proposal.existingListingReason ? ` ・ ${proposal.existingListingReason as string}` : ''}）
              </p>
              {proposeReason && <p className="whitespace-pre-wrap text-base text-text-secondary">公開してほしい理由: {proposeReason}</p>}
            </div>
          )}
          {pending && <ProposalVideoList workflowId={workflowId} />}
          {pending && (
            <div className="flex flex-col gap-2 rounded-[8px] border border-border-divider px-3 py-3">
              <p className="text-base font-medium text-text-primary">① ゲームタイトルを決める</p>
              {needsGame ? (
                <>
                  <p className="text-md text-text-secondary">
                    提案された「{newGameTitle}」はまだゲームタイトルに登録されていません。新しく登録するか、既存のゲームタイトルから選んでください。
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setCreateOpen(true)}>
                      「{newGameTitle}」を新しく登録する
                    </Button>
                    <Button variant="ghost" size="sm" onClick={openGameModal}>
                      既存のゲームタイトルから選ぶ
                    </Button>
                  </div>
                </>
              ) : !game.id ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-md text-text-primary">
                    {noGame ? 'ゲームが分からない提案です。' : ''}選ばずに承認すると、{noGameApproveLabel}公開します
                  </p>
                  <Button variant="ghost" size="sm" onClick={openGameModal}>
                    <PencilIcon size={14} />
                    ゲームタイトルを選ぶ
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="inline-flex items-center gap-1 text-md text-text-primary">
                    <CheckIcon size={14} />
                    「{game.title}」で登録します
                  </p>
                  <Button variant="ghost" size="sm" onClick={openGameModal}>
                    <PencilIcon size={14} />
                    変更する
                  </Button>
                  {gameChanged && (
                    <p className="w-full text-md text-text-muted">
                      {newGameTitle
                        ? autoSelectedExisting && game.title === newGameTitle
                          ? `提案された「${newGameTitle}」は登録済みのため、これを選んでいます。`
                          : `提案された名前は「${newGameTitle}」です。`
                        : `提案時のゲームタイトル「${proposedGame.title}」から変更しています。`}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          {!pending && proposal.approvedGameId && !newGameTitle && (
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
          {status === 'rejected' && proposalRejectReasonLabel(proposal.rejectReasonCode) && (
            <p className="text-base text-text-secondary">見送り理由（提案者に表示）: {proposalRejectReasonLabel(proposal.rejectReasonCode)}</p>
          )}
          <WorkflowDecisionNote history={data.step2History} rejectLabel="内部メモ" />
          {approveError && pending && (
            <p role="alert" className="text-md text-input-error">
              {approveError}
            </p>
          )}
        </div>

        <CardDivider />

        <WorkflowMemo workflowId={workflowId} operatorMemo={(data.operatorMemo as string) ?? null} />

        {pending && (
          <WorkflowDecisionButtons
            onReject={() => setConfirmAction('reject')}
            onApprove={() => setConfirmAction('approve')}
            disabled={deciding}
            approveBlockedReason={needsGame ? '承認するには、先に①でゲームタイトルを決めてください' : null}
          />
        )}
      </Card>

      <GameCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultTitle={newGameTitle ?? ''}
        prefill={{ platforms: newGamePlatforms, rakuten: newGameRakuten ? { ...newGameRakuten, jan: '', label: '', salesDate: '' } : null }}
        createCopy={{
          title: 'ゲームタイトルを新しく登録する',
          submitLabel: '登録する',
          notice: newGameRakuten
            ? '提案者が選んだ楽天ブックスの商品で自動セットしています。タイトル名は版・機種の表記を削った名前なので、元の商品名と見比べて確認してください。登録しても提案はまだ承認しません（審査画面に戻って承認します）。'
            : '登録しても提案はまだ承認しません。登録後、審査画面に戻って承認してください。',
        }}
        onCreated={(g) => {
          // 登録したゲームタイトルを選んだ状態にするだけ。承認は管理者が改めて押す
          setSelectedGame({ id: g.id, title: g.title });
        }}
      />

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
          approve: `承認すると、この再生リストを${game.title ? `「${game.title}」で` : noGameApproveLabel}公開し、提案者に通知します。`,
          reject: '却下すると、再生リストは登録されません。提案者には選んだ見送り理由を通知します。',
        }}
        onSubmit={(action, comment, rejectReasonCode) => handleDecision(action, comment, { rejectReasonCode })}
        rejectReasons={PROPOSAL_REJECT_REASONS}
      />
    </>
  );
}
