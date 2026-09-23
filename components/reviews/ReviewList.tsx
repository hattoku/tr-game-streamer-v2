/**
 * レビュー一覧（レビュー投稿機能仕様書「レビュー一覧」節）。
 * 件数（総数／コメントあり数）・星評価フィルター・ネタバレ折りたたみ（既定ON）・
 * 参考になったボタン・カードメニュー（通報/編集）を実装する。ソートは仕様書どおり
 * 新着順（投稿日時降順）のみ。
 */
'use client';

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { Card, CardDivider } from '@/components/ui/Card';
import { StarRating } from '@/components/ui/StarRating';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectMenu, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { MoreIcon, CommentIcon, FavoriteIcon } from '@/components/ui/icons';
import { UserAvatar } from '@/components/layout/UserDropdown';
import { LoginRequiredModal } from '@/components/layout/LoginRequiredModal';
import { ReportModal } from './ReportModal';
import { StatusChip, normalizeWatchStatus, type WatchStatus } from '@/components/ui/Chip';

const SPOILER_PREF_STORAGE_KEY = 'puremite:hideSpoilerReviews';

interface ReviewItem {
  id: string;
  userId: string;
  userDisplayName: string;
  userProfileImageUrl: string | null;
  starRating: number | null;
  watchStatus: WatchStatus | null;
  comment: string | null;
  hasSpoiler: boolean;
  helpfulCount: number;
  postedAt: Date | null;
  updatedAt: Date | null;
}

function formatDate(d: Date | null): string {
  if (!d) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

async function getIdToken(): Promise<string> {
  if (!auth.currentUser) throw new Error('not signed in');
  return auth.currentUser.getIdToken();
}

export function ReviewList({
  playlistId,
  user,
  onRequestEditFocus,
}: {
  playlistId: string;
  user: User | null;
  /** 自分のレビューカード「編集する」選択時に、同じレビューセクション内のフォームへスクロールする */
  onRequestEditFocus: () => void;
}) {
  const [reviews, setReviews] = useState<ReviewItem[] | null>(null);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [hideSpoilers, setHideSpoilers] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = localStorage.getItem(SPOILER_PREF_STORAGE_KEY);
      return stored != null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });
  const [starFilter, setStarFilter] = useState<'all' | '5' | '4' | '3' | '2' | '1'>('all');
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set());
  const [loginOpen, setLoginOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReviewItem | null>(null);
  const [busyVote, setBusyVote] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'reviews'), where('playlistId', '==', playlistId));
    return onSnapshot(q, (snap) => {
      const list: ReviewItem[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          userDisplayName: data.userDisplayName ?? 'ユーザー',
          userProfileImageUrl: data.userProfileImageUrl ?? null,
          starRating: data.starRating ?? null,
          watchStatus: normalizeWatchStatus(data.watchStatus),
          comment: data.comment ?? null,
          hasSpoiler: data.hasSpoiler ?? false,
          helpfulCount: data.helpfulCount ?? 0,
          postedAt: data.postedAt?.toDate?.() ?? null,
          updatedAt: data.updatedAt?.toDate?.() ?? null,
        };
      });
      // 新着順（投稿日時降順）。postedAt+playlistId の複合indexが無いため取得後にソートする
      list.sort((a, b) => (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0));
      setReviews(list);
    });
  }, [playlistId]);

  // ユーザー切替・アンマウント時はクリーンアップ側で戻す（effect本体では setState しない:
  // react-hooks/set-state-in-effect。components/layout/NotificationBell.tsx と同じ対応）
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'helpful_votes'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      setVotedIds(new Set(snap.docs.map((d) => d.data().reviewId as string)));
    });
    return () => {
      unsubscribe();
      setVotedIds(new Set());
    };
  }, [user]);

  // ネタバレ非表示設定（ログイン済み: users を購読）。未ログイン時の初期値は
  // LocalStorage から読み、useState の遅延初期化で描画時に一度だけ求める（effectでのsetStateを避ける）
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const v = snap.data()?.hideSpoilerReviews;
      setHideSpoilers(typeof v === 'boolean' ? v : true);
    });
  }, [user]);

  async function toggleHideSpoilers(next: boolean) {
    setHideSpoilers(next);
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { hideSpoilerReviews: next });
      } catch {
        // 失敗してもローカル表示は切り替え済みのまま（次回訪問時は既定値に戻る）
      }
    } else {
      try {
        localStorage.setItem(SPOILER_PREF_STORAGE_KEY, String(next));
      } catch {
        // 無視
      }
    }
  }

  async function handleHelpful(review: ReviewItem) {
    if (!user) {
      setLoginOpen(true);
      return;
    }
    setBusyVote(review.id);
    try {
      const idToken = await getIdToken();
      await fetch('/api/reviews/helpful', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ reviewId: review.id }),
      });
    } finally {
      setBusyVote(null);
    }
  }

  function handleReport(review: ReviewItem) {
    if (!user) {
      setLoginOpen(true);
      return;
    }
    setReportTarget(review);
  }

  if (reviews == null) return null;

  const totalCount = reviews.length;
  const commentCount = reviews.filter((r) => !!r.comment).length;
  // ★4 は 4.0〜4.5 のレビューを含める（0.5刻みの評価を1刻みの区分に丸める）
  const filtered =
    starFilter === 'all' ? reviews : reviews.filter((r) => r.starRating != null && Math.floor(r.starRating) === Number(starFilter));

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-medium text-text-primary">
          {totalCount}件のレビュー
          {commentCount > 0 && <span className="ml-2 text-md font-normal text-text-muted">うちコメントあり {commentCount}件</span>}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox label="ネタバレを含むコメントを隠す" checked={hideSpoilers} onChange={(e) => toggleHideSpoilers(e.target.checked)} />
          <SelectMenu
            value={starFilter}
            onValueChange={setStarFilter}
            aria-label="星評価で絞り込み"
            prefix="評価:"
            options={[
              { value: 'all', label: '全て' },
              { value: '5', label: '★5' },
              { value: '4', label: '★4' },
              { value: '3', label: '★3' },
              { value: '2', label: '★2' },
              { value: '1', label: '★1' },
            ]}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<CommentIcon />} title="レビューがまだありません" description="最初のレビューを投稿してみませんか？" />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((review, i) => {
            const isSelf = user?.uid === review.userId;
            const voted = votedIds.has(review.id);
            const spoilerHidden = review.hasSpoiler && hideSpoilers && !revealedSpoilers.has(review.id);
            return (
              <div key={review.id}>
                {i > 0 && <CardDivider className="mb-3" />}
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <UserAvatar name={review.userDisplayName} imageUrl={review.userProfileImageUrl} size={32} />
                      <div className="flex flex-col">
                        <span className="text-base font-medium text-text-primary">{review.userDisplayName}</span>
                        <span className="text-sm text-text-muted">
                          {formatDate(review.postedAt)}
                          {review.updatedAt && review.postedAt && review.updatedAt.getTime() !== review.postedAt.getTime()
                            ? `（${formatDate(review.updatedAt)} 更新）`
                            : ''}
                        </span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" aria-label="メニュー" className="rounded-[6px] p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary">
                          <MoreIcon size={18} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {isSelf ? (
                          <DropdownMenuItem onSelect={onRequestEditFocus}>編集する</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => handleReport(review)}>通報する</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {review.watchStatus && <StatusChip status={review.watchStatus} readOnly />}
                    {review.starRating != null && (
                      <span className="inline-flex items-center gap-2">
                        <StarRating value={review.starRating} readOnly size={15} />
                        <span className="text-md text-brand-score">{review.starRating.toFixed(1)}</span>
                      </span>
                    )}
                  </div>

                  {review.comment &&
                    (spoilerHidden ? (
                      <button
                        type="button"
                        onClick={() => setRevealedSpoilers((prev) => new Set(prev).add(review.id))}
                        className="self-start rounded-[8px] border border-border-chip bg-bg-input px-3 py-2 text-base text-text-muted hover:text-text-primary"
                      >
                        ネタバレを含みます。表示する
                      </button>
                    ) : (
                      <p className="whitespace-pre-wrap text-base text-text-secondary">{review.comment}</p>
                    ))}

                  {!isSelf && (
                    <div>
                      <Button
                        variant="secondary"
                        size="sm"
                        active={voted}
                        disabled={busyVote === review.id}
                        onClick={() => handleHelpful(review)}
                      >
                        <FavoriteIcon size={13} />
                        参考になった（{review.helpfulCount}）
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LoginRequiredModal open={loginOpen} onOpenChange={setLoginOpen} title="この操作にはアカウントが必要です" />
      {reportTarget && user && (
        <ReportModal
          open={!!reportTarget}
          onOpenChange={(open) => !open && setReportTarget(null)}
          reviewId={reportTarget.id}
          playlistId={playlistId}
          userId={user.uid}
        />
      )}
    </Card>
  );
}
