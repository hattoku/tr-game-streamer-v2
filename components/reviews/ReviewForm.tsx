/**
 * レビュー投稿UI（ページ 再生リスト レビュー投稿機能 仕様書「レビュー投稿UI」節）。
 * 星評価・視聴ステータスの選択は即時保存（マイリスト登録を伴う、仕様書「マイリスト登録」節）。
 * コメントは「レビューを投稿する」で展開し、明示的な「投稿する」操作でのみ保存する。
 * 信頼度スコアの算出はクライアントで信頼できないため app/api/reviews/upsert を介する
 * （フェーズ3計画参照）。
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { StarRating } from '@/components/ui/StarRating';
import { Textarea, Checkbox } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { ChevronDownIcon } from '@/components/ui/icons';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/DropdownMenu';
import { LoginRequiredModal } from '@/components/layout/LoginRequiredModal';
import {
  REVIEW_PRIMARY_STATUSES,
  REVIEW_OTHER_STATUSES,
  REVIEW_WATCH_STATUS_LABEL,
  type ReviewWatchStatus,
} from '@/lib/review-status';

const MAX_COMMENT_LENGTH = 2000;
const NG_WORD_CHECK_DELAY_MS = 500;

interface ReviewDoc {
  starRating: number | null;
  watchStatus: ReviewWatchStatus | null;
  comment: string | null;
  hasSpoiler: boolean;
}

const EMPTY_REVIEW: ReviewDoc = { starRating: null, watchStatus: null, comment: null, hasSpoiler: false };

const UPSERT_ERROR_MESSAGE: Record<string, string> = {
  url_in_comment: 'URLの入力はできません',
  ng_word: '不適切な表現が含まれています',
  comment_too_long: `コメントは${MAX_COMMENT_LENGTH}文字以内で入力してください`,
};

async function getIdToken(): Promise<string> {
  if (!auth.currentUser) throw new Error('not signed in');
  return auth.currentUser.getIdToken();
}

export function ReviewForm({ playlistId, user }: { playlistId: string; user: User | null }) {
  const { toast } = useToast();
  const [saved, setSaved] = useState<ReviewDoc>(EMPTY_REVIEW);
  const [starRating, setStarRating] = useState<number | null>(null);
  const [watchStatus, setWatchStatus] = useState<ReviewWatchStatus | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [hasSpoiler, setHasSpoiler] = useState(false);
  const [ngWordError, setNgWordError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const ngCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ngCheckSeq = useRef(0);

  // 自分の投稿済みレビューを購読し、フォームへ反映する（編集モード）。
  // ユーザー切替・アンマウント時はクリーンアップ側で戻す（effect本体では setState しない:
  // react-hooks/set-state-in-effect。components/layout/NotificationBell.tsx と同じ対応）
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'reviews', `${user.uid}_${playlistId}`);
    const unsubscribe = onSnapshot(ref, (snap) => {
      const data = snap.exists()
        ? {
            starRating: (snap.data().starRating as number | null) ?? null,
            watchStatus: (snap.data().watchStatus as ReviewWatchStatus | null) ?? null,
            comment: (snap.data().comment as string | null) ?? null,
            hasSpoiler: (snap.data().hasSpoiler as boolean) ?? false,
          }
        : EMPTY_REVIEW;
      setSaved(data);
      setStarRating(data.starRating);
      setWatchStatus(data.watchStatus);
      setComment(data.comment ?? '');
      setHasSpoiler(data.hasSpoiler);
    });
    return () => {
      unsubscribe();
      setSaved(EMPTY_REVIEW);
      setStarRating(null);
      setWatchStatus(null);
      setComment('');
      setHasSpoiler(false);
    };
  }, [user, playlistId]);

  // URLチェックは入力から直接導出できるため state ではなく描画時に計算する
  const urlError = comment.includes('http://') || comment.includes('https://') ? 'URLの入力はできません' : null;
  // ngWordError はデバウンスされたサーバー判定結果のみを保持する state のため、コメントが
  // 空のときは（前回判定結果が残っていても）描画時に無視する
  const ngWordDisplayError = comment.trim() ? ngWordError : null;

  useEffect(() => {
    if (ngCheckTimer.current) clearTimeout(ngCheckTimer.current);
    if (!comment.trim() || !user) return;
    const seq = ++ngCheckSeq.current;
    ngCheckTimer.current = setTimeout(async () => {
      try {
        const idToken = await getIdToken();
        const res = await fetch('/api/reviews/validate-comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ text: comment }),
        });
        const body = await res.json();
        if (seq === ngCheckSeq.current) {
          setNgWordError(body.hasNgWord ? '不適切な表現が含まれています' : null);
        }
      } catch {
        // 通信エラー時は最終送信時のサーバー側検証に委ねる
      }
    }, NG_WORD_CHECK_DELAY_MS);
    return () => {
      if (ngCheckTimer.current) clearTimeout(ngCheckTimer.current);
    };
  }, [comment, user]);

  async function persist(next: { starRating?: number | null; watchStatus?: ReviewWatchStatus | null; comment?: string; hasSpoiler?: boolean }) {
    if (!user) return;
    setBusy(true);
    try {
      const idToken = await getIdToken();
      const res = await fetch('/api/reviews/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          playlistId,
          starRating: next.starRating !== undefined ? next.starRating : starRating,
          watchStatus: next.watchStatus !== undefined ? next.watchStatus : watchStatus,
          comment: next.comment !== undefined ? next.comment : saved.comment ?? '',
          hasSpoiler: next.hasSpoiler !== undefined ? next.hasSpoiler : hasSpoiler,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({ type: 'error', message: UPSERT_ERROR_MESSAGE[body.error] ?? '送信に失敗しました。時間をおいて再試行してください' });
        return false;
      }
      return true;
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  function requireLogin(): boolean {
    if (user) return true;
    setLoginOpen(true);
    return false;
  }

  async function handlePickStar(v: number | null) {
    if (!requireLogin()) return;
    const previous = starRating;
    setStarRating(v);
    const ok = await persist({ starRating: v });
    if (ok) {
      toast({ type: 'success', message: v == null ? '評価を取り消しました' : '評価を保存しました' });
    } else {
      setStarRating(previous);
    }
  }

  async function handlePickStatus(s: ReviewWatchStatus) {
    if (!requireLogin()) return;
    const previous = watchStatus;
    const next = watchStatus === s ? null : s;
    setWatchStatus(next);
    const ok = await persist({ watchStatus: next });
    if (ok) {
      toast({ type: 'success', message: next == null ? 'ステータスを解除しました' : `ステータスを「${REVIEW_WATCH_STATUS_LABEL[s]}」にしました` });
    } else {
      setWatchStatus(previous);
    }
  }

  function handleOpenComment() {
    if (!requireLogin()) return;
    setCommentOpen(true);
  }

  function handleCancelComment() {
    setComment(saved.comment ?? '');
    setHasSpoiler(saved.hasSpoiler);
    // 保存済みコメントが無い場合（新規入力の途中でキャンセル）は入力欄を閉じる。
    // 既存コメントがある場合は編集モードのまま内容だけ元に戻す
    if (!saved.comment) setCommentOpen(false);
  }

  async function handleSubmitComment() {
    if (!requireLogin()) return;
    if (urlError || ngWordDisplayError) return;
    const ok = await persist({ comment, hasSpoiler });
    if (ok) {
      toast({ type: 'success', message: saved.comment ? '更新しました' : '投稿しました' });
      setCommentOpen(false);
    }
  }

  async function handleDelete() {
    if (!user) return;
    setBusy(true);
    try {
      const idToken = await getIdToken();
      const res = await fetch('/api/reviews/upsert', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ playlistId }),
      });
      if (!res.ok) {
        toast({ type: 'error', message: '削除に失敗しました。時間をおいて再試行してください' });
        return;
      }
      setStarRating(null);
      setWatchStatus(null);
      setComment('');
      setHasSpoiler(false);
      setCommentOpen(false);
      toast({ type: 'success', message: 'レビューを削除しました' });
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setBusy(false);
      setConfirmDeleteOpen(false);
    }
  }

  const hasSavedReview = saved.starRating != null || saved.watchStatus != null || !!saved.comment;
  const canSubmitComment = !urlError && !ngWordDisplayError && !busy;

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-xl font-medium text-text-primary">この再生リストに対してレビューする</h2>

      <div className="flex flex-col gap-2">
        <StarRating
          value={starRating}
          onChange={(v) => handlePickStar(v)}
          size={26}
          aria-label="この再生リストの星評価"
        />
        {!commentOpen && starRating != null && !saved.comment && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <p className="text-base text-text-secondary">この再生リストに対する評価を書いてみませんか？</p>
            <Button variant="secondary" size="sm" onClick={handleOpenComment}>
              レビューを投稿する
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {REVIEW_PRIMARY_STATUSES.map((s) => (
          <Button key={s} variant="secondary" active={watchStatus === s} onClick={() => handlePickStatus(s)} disabled={busy}>
            {REVIEW_WATCH_STATUS_LABEL[s]}
          </Button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" active={!!watchStatus && REVIEW_OTHER_STATUSES.includes(watchStatus)} disabled={busy}>
              その他
              <ChevronDownIcon size={12} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {REVIEW_OTHER_STATUSES.map((s) => (
              <DropdownMenuItem key={s} onSelect={() => handlePickStatus(s)}>
                {REVIEW_WATCH_STATUS_LABEL[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!commentOpen && !starRating && !saved.comment && (
        <Button variant="secondary" size="sm" className="self-start" onClick={handleOpenComment}>
          レビューを投稿する
        </Button>
      )}

      {(commentOpen || saved.comment) && (
        <div className="flex flex-col gap-2 border-t border-border-divider pt-4">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
            placeholder="この再生リストのレビューを書く（任意）"
            aria-label="レビューコメント"
            aria-invalid={!!(urlError || ngWordDisplayError)}
          />
          <div className="flex items-center justify-between text-md text-text-muted">
            <span>
              {(urlError || ngWordDisplayError) && <span className="text-input-error">{urlError ?? ngWordDisplayError}</span>}
            </span>
            <span>
              {comment.length} / {MAX_COMMENT_LENGTH}
            </span>
          </div>
          <Checkbox label="ネタバレを含む" checked={hasSpoiler} onChange={(e) => setHasSpoiler(e.target.checked)} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleCancelComment} disabled={busy}>
              キャンセル
            </Button>
            <Button variant="primary" onClick={handleSubmitComment} disabled={!canSubmitComment} loading={busy}>
              {saved.comment ? '更新する' : '投稿する'}
            </Button>
          </div>
        </div>
      )}

      {hasSavedReview && !commentOpen && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteOpen(true)} disabled={busy}>
            レビューを削除する
          </Button>
        </div>
      )}

      <LoginRequiredModal open={loginOpen} onOpenChange={setLoginOpen} title="レビューを投稿するにはアカウントが必要です" />

      <Modal open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen} title="このレビューを削除しますか？" description="この操作は取り消せません。">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDeleteOpen(false)} disabled={busy}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={handleDelete} loading={busy}>
            削除する
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
