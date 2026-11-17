/**
 * 審査ワークフロー詳細のうち、詳細ページからの変更の提案（type: game_title_edit・channel_report・playlist_report。
 * 管理 審査ワークフロー仕様書 §16、ページ 詳細ページからの変更提案 仕様書 §8）。
 * 同じ対象への報告をまとめて見せ（審査中は reportData.targetKey、処理済みは reportData.decisionId が同じもの）、
 * 承認・却下はまとめて行う（API 側で同じ対象の審査中の提案をすべて処理し、報告した全員に通知する）。
 * 承認の処理は理由ごとの既定（いちばん多い理由）を選んだ状態で出し、運営が選び直せる。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/Button';
import { Card, CardDivider } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { ExternalLinkIcon } from '@/components/ui/icons';
import { GameSelectModal, type GameOption } from '@/components/playlists/GameSelectModal';
import { GameCreateModal } from '@/components/games/GameCreateModal';
import {
  CHANGE_APPROVE_ACTIONS,
  CHANGE_APPROVE_ACTION_LABEL,
  CHANGE_REJECT_REASONS,
  CHANGE_TARGET_LABEL,
  changeRejectReasonLabel,
  defaultApproveAction,
  describeChangeReason,
  type ChangeApproveAction,
  type ChangeTargetType,
} from '@/lib/change-proposal-shared';
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

interface GroupItem {
  id: string;
  submittedBy: string;
  submittedAt: number;
  reason: string | null;
  fields: string[] | null;
  detail: string | null;
  duplicateGameName: string | null;
  proposedGameId: string | null;
  proposedGameName: string | null;
  proposedGameTitle: string | null;
}

const LISTING_LABEL: Record<string, string> = {
  listed: '掲載中',
  unconfirmed: '確認待ち',
  non_game: 'ゲームではない',
  excluded: '対象外',
  too_short: '動画が少ない',
  channel_off: 'チャンネルごと非表示',
};

const ERROR_MESSAGE: Record<string, string> = {
  already_processed: 'すでに処理されています',
  game_required: '付け替えるゲームを選んでください',
  playlist_channel_off: 'この再生リストはチャンネルごと非表示になっています',
  playlist_not_found: '再生リストが見つかりませんでした',
  game_not_found: 'ゲームが見つかりませんでした',
  channel_not_listed: 'このチャンネルは掲載チャンネルではありません',
};

function targetHref(targetType: ChangeTargetType, targetId: string): string {
  return targetType === 'game' ? `/games/${targetId}` : targetType === 'channel' ? `/channels/${targetId}` : `/playlists/${targetId}`;
}

export function ChangeProposalDetail({ workflowId, data }: { workflowId: string; data: DocumentData }) {
  const { toast } = useToast();
  const status = (data.status as WorkflowStatus) ?? 'reviewing_lv1';
  const pending = isPendingStatus(status);
  const report = (data.reportData ?? {}) as Record<string, unknown>;
  const targetType = report.targetType as ChangeTargetType;
  const targetId = (report.targetId as string) ?? '';
  const targetKey = (report.targetKey as string) ?? '';
  const decisionId = (report.decisionId as string | undefined) ?? null;

  const [group, setGroup] = useState<GroupItem[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [targetState, setTargetState] = useState<{ gameName?: string; listingStatus?: string; missing?: boolean } | null>(null);
  const [chosen, setChosen] = useState<ChangeApproveAction | null>(null);
  const [relinkGame, setRelinkGame] = useState<{ id: string; title: string } | null>(null);
  const [selectOpen, setSelectOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [games, setGames] = useState<GameOption[]>([]);
  const [confirmAction, setConfirmAction] = useState<DecisionAction | null>(null);

  // まとめた報告（審査中なら同じ対象の審査中のもの、処理済みなら同じ処理のもの）
  useEffect(() => {
    if (!targetKey) return;
    return onSnapshot(query(collection(db, 'workflows'), where('reportData.targetKey', '==', targetKey)), (snap) => {
      const items = snap.docs
        .filter((d) => {
          const s = d.data().status as WorkflowStatus;
          if (pending) return isPendingStatus(s);
          return (d.data().reportData?.decisionId ?? d.id) === (decisionId ?? workflowId);
        })
        .map((d): GroupItem => {
          const r = d.data().reportData ?? {};
          return {
            id: d.id,
            submittedBy: (d.data().submittedBy as string) ?? '',
            submittedAt: d.data().submittedAt?.toMillis?.() ?? 0,
            reason: (r.reason as string | null) ?? null,
            fields: (r.fields as string[] | null) ?? null,
            detail: (r.detail as string | null) ?? null,
            duplicateGameName: (r.duplicateGameName as string | null) ?? null,
            proposedGameId: (r.proposedGameId as string | null) ?? null,
            proposedGameName: (r.proposedGameName as string | null) ?? null,
            proposedGameTitle: (r.proposedGameTitle as string | null) ?? null,
          };
        })
        .sort((a, b) => a.submittedAt - b.submittedAt);
      setGroup(items);
    });
  }, [targetKey, pending, decisionId, workflowId]);

  // 報告した人の表示名
  useEffect(() => {
    if (!group) return;
    const missing = [...new Set(group.map((g) => g.submittedBy))].filter((uid) => uid && !(uid in names));
    if (missing.length === 0) return;
    Promise.all(
      missing.map(async (uid) => {
        const snap = await getDoc(doc(db, 'users', uid)).catch(() => null);
        return [uid, (snap?.data()?.displayName as string) ?? '(退会したユーザー)'] as const;
      }),
    ).then((entries) => setNames((prev) => ({ ...prev, ...Object.fromEntries(entries) })));
  }, [group, names]);

  // 対象の今の状態（再生リストはゲームと掲載状態）
  useEffect(() => {
    if (!targetId || targetType !== 'playlist') return;
    return onSnapshot(doc(db, 'playlists', targetId), (snap) => {
      if (!snap.exists()) {
        setTargetState({ missing: true });
        return;
      }
      setTargetState({ gameName: (snap.data().gameName as string) || '（未設定）', listingStatus: snap.data().listingStatus as string });
    });
  }, [targetId, targetType]);

  // いちばん多い理由と、付け替え先の候補（いちばん多く選ばれたゲーム）
  const majority = useMemo(() => {
    if (!group || group.length === 0) return { reason: null as string | null, game: null as { id: string; title: string } | null, title: null as string | null };
    const tally = new Map<string, number>();
    const gameTally = new Map<string, { title: string; n: number }>();
    let title: string | null = null;
    for (const g of group) {
      if (g.reason) tally.set(g.reason, (tally.get(g.reason) ?? 0) + 1);
      if (g.proposedGameId) {
        const cur = gameTally.get(g.proposedGameId) ?? { title: g.proposedGameName ?? '', n: 0 };
        gameTally.set(g.proposedGameId, { ...cur, n: cur.n + 1 });
      }
      if (!title && g.proposedGameTitle) title = g.proposedGameTitle;
    }
    const reason = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const topGame = [...gameTally.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    return { reason, game: topGame ? { id: topGame[0], title: topGame[1].title } : null, title };
  }, [group]);

  const action: ChangeApproveAction = chosen ?? defaultApproveAction(targetType, majority.reason);
  const gameForRelink = relinkGame ?? majority.game;
  const options = CHANGE_APPROVE_ACTIONS[targetType] ?? ['none'];

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

  async function handleDecision(decision: DecisionAction, comment: string | null, rejectReasonCode: string | null): Promise<boolean> {
    try {
      await callWorkflowApi(workflowId, {
        action: decision,
        comment,
        rejectReasonCode,
        approveAction: decision === 'approve' ? action : undefined,
        gameId: decision === 'approve' && action === 'relink' ? (gameForRelink?.id ?? null) : undefined,
      });
      toast({ type: 'success', message: decision === 'approve' ? '承認しました' : '却下しました' });
      return true;
    } catch (e) {
      const code = (e as { code?: string | null }).code ?? '';
      toast({ type: 'error', message: ERROR_MESSAGE[code] ?? '処理に失敗しました。時間をおいて再試行してください' });
      return false;
    }
  }

  const history = (data.step2History ?? []) as Array<{ action?: string; comment?: string | null; approveAction?: ChangeApproveAction | null; gameName?: string | null }>;
  const last = history[history.length - 1];
  const approveBlocked = pending && action === 'relink' && !gameForRelink ? '付け替えるゲームを選んでください' : null;

  return (
    <>
      <Card className="flex flex-col gap-4" data-testid="change-proposal-detail">
        <WorkflowHeader typeLabel={`変更の提案（${CHANGE_TARGET_LABEL[targetType] ?? ''}）`} submittedAt={data.submittedAt?.toMillis?.() ?? 0} status={status} />

        <CardDivider />

        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium text-text-primary">対象</p>
          <div className="flex items-center gap-3">
            {typeof report.targetThumbnailUrl === 'string' && report.targetThumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={report.targetThumbnailUrl} alt="" referrerPolicy="no-referrer" className="h-10 w-16 shrink-0 rounded-[4px] bg-bg-btn object-cover" />
            )}
            <Link
              href={targetHref(targetType, targetId)}
              target="_blank"
              className="inline-flex items-center gap-1 break-all text-base text-text-primary underline-offset-4 hover:underline"
            >
              {(report.targetName as string) || targetId}
              <ExternalLinkIcon size={14} className="shrink-0 text-text-muted" />
            </Link>
          </div>
          {targetType === 'playlist' && targetState && (
            <p className="text-md text-text-tertiary">
              {targetState.missing ? '再生リストが見つかりません' : `今のゲーム: ${targetState.gameName} ／ 掲載状態: ${LISTING_LABEL[targetState.listingStatus ?? ''] ?? targetState.listingStatus}`}
            </p>
          )}
        </div>

        <CardDivider />

        <div className="flex flex-col gap-3">
          <p className="text-lg font-medium text-text-primary">報告（{group?.length ?? '…'}人）</p>
          <ul className="flex flex-col gap-2" data-testid="change-proposal-reports">
            {(group ?? []).map((g) => (
              <li key={g.id} className="flex flex-col gap-1 rounded-[8px] bg-bg-hover px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-md text-text-tertiary">
                  <span>{names[g.submittedBy] ?? '…'}</span>
                  <time>{g.submittedAt ? new Date(g.submittedAt).toLocaleString('ja-JP') : '-'}</time>
                </div>
                <p className="text-base text-text-primary">{describeChangeReason(targetType, g.reason, g.fields)}</p>
                {g.duplicateGameName && <p className="text-md text-text-secondary">もう一方のゲーム: {g.duplicateGameName}</p>}
                {(g.proposedGameName || g.proposedGameTitle) && (
                  <p className="text-md text-text-secondary">
                    正しいゲーム: {g.proposedGameName ?? `${g.proposedGameTitle}（一覧に無いゲームとして入力）`}
                  </p>
                )}
                {g.detail && <p className="whitespace-pre-wrap text-md text-text-secondary">補足: {g.detail}</p>}
              </li>
            ))}
          </ul>
        </div>

        {!pending && last && (
          <>
            <CardDivider />
            <div className="flex flex-col gap-1">
              <p className="text-base text-text-secondary">
                {last.action === 'approved'
                  ? `処理: ${CHANGE_APPROVE_ACTION_LABEL[last.approveAction ?? 'none']}${last.gameName ? `（${last.gameName}）` : ''}`
                  : `見送り理由: ${changeRejectReasonLabel(report.rejectReasonCode) ?? '-'}`}
              </p>
              <WorkflowDecisionNote history={data.step2History} rejectLabel="内部メモ" />
            </div>
          </>
        )}

        {pending && (
          <>
            <CardDivider />
            <fieldset className="flex flex-col gap-2" data-testid="change-proposal-actions">
              <legend className="mb-1 text-lg font-medium text-text-primary">承認したときの処理</legend>
              {options.map((o) => (
                <label key={o} className="inline-flex cursor-pointer items-center gap-2 text-base text-text-secondary">
                  <input type="radio" name="approve-action" value={o} checked={action === o} onChange={() => setChosen(o)} className="size-4" />
                  {CHANGE_APPROVE_ACTION_LABEL[o]}
                </label>
              ))}
              {action === 'relink' && (
                <div className="ml-6 flex flex-wrap items-center gap-2 text-md text-text-secondary">
                  <span>付け替えるゲーム: {gameForRelink ? <span className="text-text-primary">{gameForRelink.title}</span> : '（未選択）'}</span>
                  <Button variant="secondary" size="sm" onClick={openSelect}>
                    既存のゲームから選ぶ
                  </Button>
                  {majority.title && (
                    <Button variant="secondary" size="sm" onClick={() => setCreateOpen(true)}>
                      「{majority.title}」を新しく登録する
                    </Button>
                  )}
                </div>
              )}
              {targetType === 'game' && (
                <p className="text-md text-text-tertiary">
                  ゲーム詳細の「ゲームタイトル情報を編集する」で直してから承認してください。{' '}
                  <Link href={`/games/${targetId}`} target="_blank" className="text-text-primary underline underline-offset-[3px]">
                    編集画面を開く
                  </Link>
                </p>
              )}
            </fieldset>
          </>
        )}

        <CardDivider />

        <WorkflowMemo workflowId={workflowId} operatorMemo={(data.operatorMemo as string) ?? null} />

        {pending && (
          <WorkflowDecisionButtons
            onReject={() => setConfirmAction('reject')}
            onApprove={() => setConfirmAction('approve')}
            approveBlockedReason={approveBlocked}
          />
        )}
      </Card>

      <GameSelectModal
        open={selectOpen}
        onOpenChange={setSelectOpen}
        games={games}
        onSelect={(g) => {
          setRelinkGame({ id: g.id, title: g.title });
          setSelectOpen(false);
        }}
      />
      <GameCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultTitle={majority.title ?? ''}
        onCreated={(g) => setRelinkGame({ id: g.id, title: g.title })}
      />
      <WorkflowDecisionModal
        action={confirmAction}
        onClose={() => setConfirmAction(null)}
        title={{ approve: 'まとめて承認しますか?', reject: 'まとめて却下しますか?' }}
        description={{
          approve: `処理: ${CHANGE_APPROVE_ACTION_LABEL[action]}${action === 'relink' && gameForRelink ? `（${gameForRelink.title}）` : ''}。この対象への報告（${group?.length ?? 0}人）をすべて承認し、全員に反映を通知します。`,
          reject: `この対象への報告（${group?.length ?? 0}人）をすべて却下し、全員に見送りを通知します。`,
        }}
        onSubmit={handleDecision}
        rejectReasons={CHANGE_REJECT_REASONS}
      />
    </>
  );
}
