/**
 * 詳細ページ（ゲーム・チャンネル・再生リスト）の「変更を提案する」ボタンとモーダル（ページ 詳細ページからの変更提案 仕様書 §3〜§6）。
 * 運営が確認してから反映する（審査ワークフロー）。送信は POST /api/change-proposals（回数・重複・対象の状態はサーバーで確かめる）。
 * - 管理者には出さない（直接直せるため）。未ログインで押すとログイン案内を出す
 * - モーダルを開いたとき、自分の審査中の提案があれば入力の代わりに「確認待ちです」と提案履歴へのリンクを出す
 * - チャンネルのモーダルには、本人・事務所の方向けにお問い合わせへの案内を小さく出す（詳細ページそのものには出さない。§5.3）
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button, LinkButton } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { FlagIcon, UserIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { LoginRequiredModal } from '@/components/layout/LoginRequiredModal';
import { GameSelectModal, type GameOption } from '@/components/playlists/GameSelectModal';
import { MAX_GAME_TITLE_LENGTH } from '@/lib/proposal-shared';
import {
  CHANGE_TARGET_LABEL,
  CHANNEL_CHANGE_REASONS,
  GAME_CHANGE_FIELDS,
  MAX_CHANGE_DETAIL_LENGTH,
  PLAYLIST_CHANGE_REASONS,
  changeTargetKey,
  type ChangeTargetType,
} from '@/lib/change-proposal-shared';

const ERROR_MESSAGE: Record<string, string> = {
  daily_limit: '提案は1日5件までです。時間をおいてお試しください',
  target_unavailable: '今は提案を受け付けていません',
  target_not_found: '対象が見つかりませんでした',
  game_not_found: '選んだゲームが見つかりませんでした',
  same_game: '今付いているゲームと同じです',
  game_unset: 'この再生リストはゲームが未設定です。ゲームの登録から選んでください',
  detail_too_long: `補足は${MAX_CHANGE_DETAIL_LENGTH}文字までです`,
};

/** 本人・事務所の方への案内（チャンネルのみ。仕様書 §5.3） */
function CreatorNote() {
  return (
    <div className="rounded-[8px] bg-bg-hover px-3 py-2 text-md text-text-tertiary" data-testid="change-proposal-creator-note">
      ご本人・事務所の方へ: 掲載を止めたい場合は、お問い合わせからお知らせください。確認でき次第、掲載を止めます。{' '}
      <Link href="/contact?type=channel_listing" className="text-text-primary underline underline-offset-[3px] hover:text-text-secondary">
        掲載についてお問い合わせ →
      </Link>
    </div>
  );
}

interface ChangeProposalButtonProps {
  targetType: ChangeTargetType;
  targetId: string;
  targetName: string;
  thumbnailUrl?: string | null;
  /** 再生リストのみ: ゲーム未設定なら「付いているゲームが違う」を出さない。今のゲームは選べない */
  currentGameId?: string | null;
  className?: string;
}

export function ChangeProposalButton({ targetType, targetId, targetName, thumbnailUrl, currentGameId = null, className }: ChangeProposalButtonProps) {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === 'owner' || role === 'operator';
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  // null: 確認中、true: 自分の提案が審査中、false: 送れる
  const [pending, setPending] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [detail, setDetail] = useState('');
  const [proposedGame, setProposedGame] = useState<GameOption | null>(null);
  const [proposedGameTitle, setProposedGameTitle] = useState('');
  const [enteringTitle, setEnteringTitle] = useState(false);
  const [duplicateGame, setDuplicateGame] = useState<GameOption | null>(null);
  const [gamePicker, setGamePicker] = useState<'proposed' | 'duplicate' | null>(null);
  const [games, setGames] = useState<GameOption[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAdmin) return null;

  const label = CHANGE_TARGET_LABEL[targetType];
  const reasons = targetType === 'channel' ? CHANNEL_CHANGE_REASONS : PLAYLIST_CHANGE_REASONS.filter((r) => r.value !== 'wrong_game' || !!currentGameId);
  const detailRequired = targetType === 'game' || reasons.find((r) => r.value === reason)?.detailRequired === true;
  const needsGame = targetType === 'playlist' && reason === 'wrong_game';
  const hasGame = enteringTitle ? !!proposedGameTitle.trim() : !!proposedGame;
  const canSubmit =
    (targetType === 'game' ? fields.length > 0 : !!reason) && (!detailRequired || !!detail.trim()) && (!needsGame || hasGame) && !submitting;

  function reset() {
    setReason(null);
    setFields([]);
    setDetail('');
    setProposedGame(null);
    setProposedGameTitle('');
    setEnteringTitle(false);
    setDuplicateGame(null);
    setError(null);
  }

  async function handleOpen() {
    if (!user) {
      setLoginOpen(true);
      return;
    }
    reset();
    setPending(null);
    setOpen(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/change-proposals/mine?targetKey=${encodeURIComponent(changeTargetKey(targetType, targetId))}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = (await res.json().catch(() => ({}))) as { pending?: boolean };
      setPending(res.ok ? json.pending === true : false);
    } catch {
      setPending(false);
    }
  }

  async function openGamePicker(which: 'proposed' | 'duplicate') {
    if (!games) {
      try {
        const snap = await getDocs(collection(db, 'games'));
        setGames(
          snap.docs
            .map((d) => ({
              id: d.id,
              title: (d.data().title as string) ?? '',
              packageImageUrl: (d.data().packageImageUrl as string) ?? null,
              aliases: (d.data().aliases as string[] | undefined) ?? [],
            }))
            .sort((a, b) => a.title.localeCompare(b.title, 'ja')),
        );
      } catch {
        toast({ type: 'error', message: 'ゲームの一覧を読み込めませんでした' });
        return;
      }
    }
    setGamePicker(which);
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/change-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          targetType,
          targetId,
          reason: targetType === 'game' ? null : reason,
          fields: targetType === 'game' ? fields : null,
          detail,
          duplicateGameId: targetType === 'game' && fields.includes('duplicate') ? (duplicateGame?.id ?? null) : null,
          proposedGameId: needsGame && !enteringTitle ? (proposedGame?.id ?? null) : null,
          proposedGameTitle: needsGame && enteringTitle ? proposedGameTitle : null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setOpen(false);
        toast({ type: 'success', message: '提案を受け付けました。結果は提案履歴でお知らせします' });
        return;
      }
      if (json.error === 'already_proposed') {
        setPending(true);
        return;
      }
      setError(
        json.error === 'target_unavailable'
          ? `この${label}は今、提案を受け付けていません`
          : (ERROR_MESSAGE[json.error ?? ''] ?? '提案を送れませんでした。時間をおいて再試行してください'),
      );
    } catch {
      setError('通信エラーが発生しました。時間をおいて再試行してください');
    } finally {
      setSubmitting(false);
    }
  }

  const excludedGameIds = new Set([currentGameId, targetType === 'game' ? targetId : null].filter((id): id is string => !!id));

  return (
    <>
      <Button variant="ghost" size="sm" onClick={handleOpen} className={cn('text-text-tertiary', className)} data-testid="change-proposal-button">
        <FlagIcon size={13} />
        変更を提案する
      </Button>

      <LoginRequiredModal
        open={loginOpen}
        onOpenChange={setLoginOpen}
        title="変更を提案するにはアカウントが必要です"
        note={targetType === 'channel' ? <CreatorNote /> : undefined}
      />

      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!next && submitting) return;
          setOpen(next);
        }}
        title={`この${label}への変更を提案`}
      >
        <div className="flex flex-col gap-4" data-testid="change-proposal-modal">
          <div className="flex items-center gap-3">
            {thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnailUrl}
                alt=""
                referrerPolicy="no-referrer"
                className={cn('shrink-0 bg-bg-btn object-cover', targetType === 'playlist' ? 'h-9 w-16 rounded-[4px]' : targetType === 'channel' ? 'size-9 rounded-full' : 'size-9 rounded-[4px]')}
              />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[4px] bg-bg-btn text-text-muted">
                <UserIcon size={16} />
              </span>
            )}
            <p className="min-w-0 break-words text-base text-text-primary">{targetName}</p>
          </div>

          {pending === null ? (
            <p className="text-md text-text-muted">読み込み中…</p>
          ) : pending ? (
            <div className="flex flex-col gap-3" data-testid="change-proposal-pending">
              <p className="text-base text-text-secondary">この{label}への提案は確認待ちです。結果は提案履歴でお知らせします。</p>
              <LinkButton href="/playlists/proposals" variant="secondary" size="sm" className="w-fit">
                提案履歴を見る
              </LinkButton>
            </div>
          ) : (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-md text-text-tertiary">何が違いますか？{targetType === 'game' ? '（複数選べます）' : ''}</legend>
                {targetType === 'game'
                  ? GAME_CHANGE_FIELDS.map((f) => (
                      <label key={f.value} className="inline-flex cursor-pointer items-center gap-2 text-base text-text-secondary">
                        <input
                          type="checkbox"
                          value={f.value}
                          checked={fields.includes(f.value)}
                          onChange={(e) => setFields((prev) => (e.target.checked ? [...prev, f.value] : prev.filter((v) => v !== f.value)))}
                          disabled={submitting}
                          className="size-4"
                        />
                        {f.label}
                      </label>
                    ))
                  : reasons.map((r) => (
                      <label key={r.value} className="inline-flex cursor-pointer items-start gap-2 text-base text-text-secondary">
                        <input
                          type="radio"
                          name="change-reason"
                          value={r.value}
                          checked={reason === r.value}
                          onChange={() => setReason(r.value)}
                          disabled={submitting}
                          className="mt-[3px] size-4 shrink-0"
                        />
                        {r.label}
                      </label>
                    ))}
              </fieldset>

              {targetType === 'game' && fields.includes('duplicate') && (
                <div className="flex flex-wrap items-center gap-2 text-md text-text-secondary">
                  <span>もう一方のゲーム（任意）:</span>
                  {duplicateGame ? <span className="text-text-primary">{duplicateGame.title}</span> : null}
                  <Button variant="secondary" size="sm" onClick={() => openGamePicker('duplicate')} disabled={submitting}>
                    {duplicateGame ? '選び直す' : 'ゲームを選ぶ'}
                  </Button>
                </div>
              )}

              {needsGame && (
                <div className="flex flex-col gap-2" data-testid="change-proposal-game">
                  <p className="text-md text-text-tertiary">正しいゲーム（必須）</p>
                  {enteringTitle ? (
                    <>
                      <Input
                        value={proposedGameTitle}
                        onChange={(e) => setProposedGameTitle(e.target.value.slice(0, MAX_GAME_TITLE_LENGTH))}
                        placeholder="ゲーム名"
                        aria-label="正しいゲーム名"
                        disabled={submitting}
                      />
                      <button type="button" className="w-fit text-md text-text-tertiary underline underline-offset-[3px] hover:text-text-primary" onClick={() => setEnteringTitle(false)}>
                        一覧から選ぶ
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        {proposedGame && <span className="text-base text-text-primary">{proposedGame.title}</span>}
                        <Button variant="secondary" size="sm" onClick={() => openGamePicker('proposed')} disabled={submitting}>
                          {proposedGame ? '選び直す' : 'ゲームを選ぶ'}
                        </Button>
                      </div>
                      <button type="button" className="w-fit text-md text-text-tertiary underline underline-offset-[3px] hover:text-text-primary" onClick={() => setEnteringTitle(true)}>
                        一覧に無いゲームを入力する
                      </button>
                    </>
                  )}
                </div>
              )}

              <Field label={`補足（${detailRequired ? '必須' : '任意'}）`}>
                {(props) => (
                  <Textarea
                    {...props}
                    value={detail}
                    onChange={(e) => setDetail(e.target.value.slice(0, MAX_CHANGE_DETAIL_LENGTH))}
                    placeholder={targetType === 'game' ? '正しい内容を書いてください（例: 正しくは『ドラゴンクエストIV 導かれし者たち』（PS版）です）' : undefined}
                    disabled={submitting}
                    rows={3}
                  />
                )}
              </Field>

              {targetType === 'channel' && <CreatorNote />}

              <p className="text-md text-text-muted">運営が確認してから反映します。結果は提案履歴でお知らせします。</p>
              {error && (
                <p role="alert" className="text-md text-input-error">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
                  キャンセル
                </Button>
                <Button variant="primary" onClick={submit} loading={submitting} disabled={!canSubmit}>
                  提案する
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <GameSelectModal
        open={gamePicker !== null}
        onOpenChange={(next) => !next && setGamePicker(null)}
        games={(games ?? []).filter((g) => !excludedGameIds.has(g.id))}
        onSelect={(g) => {
          if (gamePicker === 'duplicate') setDuplicateGame(g);
          else setProposedGame(g);
          setGamePicker(null);
        }}
      />
    </>
  );
}
