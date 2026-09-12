'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, doc, getDocs, orderBy, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeading } from '@/components/ui/Card';
import { UnreadDot } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Tag } from '@/components/ui/Tag';
import { useToast } from '@/components/ui/Toast';
import { BellIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';

// 通知一覧ページ。document/specification/page/ページ ユーザー通知機能仕様書.md §5 準拠。
// フェーズ2.5ステップ6でデザイン適用（wiki/sources/2026-09-11-phase2.5-design-plan.md §4）。
// - 見出し＋「すべて既読にする」（§5.2, §5.6）
// - フィルタタブは実装済み種別のみ: すべて／未読／シリーズ新着（§5.3。お知らせ・審査結果・お問い合わせ返信は
//   依拠する機能が未実装のためタブを出さない）
// - カード: 未読ドット・種別ラベル・本文・日時（相対表示、title に絶対時刻）。クリックで個別既読＋遷移（§5.4）
// - ページネーション 20件（§5.5）。クライアント側で分割（通知は本人分のみで件数が小さい）
// - 空状態2種（§5.7）。未ログインは /login へ（§5.1）
// - 管理者向け「新着動画を再取得」は本来の管理画面ができるまでの暫定で、ページ下部の「管理者用」カードに隔離
//   （app/api/admin/refresh-new-videos/route.ts）
// 見送り: 通知ドロップダウン（§4.2）、FCM プッシュ（§6）、90日保持バッチ（§8）

type NotificationType = 'series_new_episode' | 'notice' | 'review_result' | 'inquiry_reply';
type Filter = 'all' | 'unread' | NotificationType;

interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
  isRead: boolean;
  playlistId: string | null;
  createdAt: number;
}

const TYPE_LABEL: Record<NotificationType, string> = {
  series_new_episode: 'シリーズ新着',
  notice: 'お知らせ',
  review_result: '審査結果',
  inquiry_reply: 'お問い合わせ返信',
};

const PAGE_SIZE = 20;

/** 相対時刻（3分前・2日前）。7日を超えたら日付 */
function formatRelative(ms: number, now = Date.now()): string {
  if (!ms) return '';
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}日前`;
  const d = new Date(ms);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function formatAbsolute(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NotificationsPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [marking, setMarking] = useState(false);

  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  const isAdmin = role === 'owner' || role === 'operator';

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  async function load(uid: string) {
    const snapshot = await getDocs(query(collection(db, 'notifications'), where('userId', '==', uid), orderBy('createdAt', 'desc')));
    setItems(
      snapshot.docs.map((d) => ({
        id: d.id,
        type: (d.data().type as NotificationType) ?? 'series_new_episode',
        message: d.data().message ?? '',
        isRead: d.data().isRead ?? false,
        playlistId: d.data().playlistId ?? null,
        createdAt: d.data().createdAt?.toMillis?.() ?? 0,
      })),
    );
  }

  useEffect(() => {
    if (!user) return;
    load(user.uid).catch((e) => {
      console.error('通知の読み込みに失敗しました', e);
      setItems([]);
      toast({ type: 'error', message: '通知の読み込みに失敗しました' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const counts = useMemo(() => {
    const list = items ?? [];
    return {
      all: list.length,
      unread: list.filter((n) => !n.isRead).length,
      series_new_episode: list.filter((n) => n.type === 'series_new_episode').length,
    };
  }, [items]);

  const visible = useMemo(() => {
    const list = items ?? [];
    if (filter === 'unread') return list.filter((n) => !n.isRead);
    if (filter === 'all') return list;
    return list.filter((n) => n.type === filter);
  }, [items, filter]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function changeFilter(next: Filter) {
    setFilter(next);
    setPage(1);
  }

  async function handleOpen(n: NotificationItem) {
    if (!n.isRead) {
      try {
        await updateDoc(doc(db, 'notifications', n.id), { isRead: true });
        setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)) ?? prev);
      } catch {
        toast({ type: 'error', message: '既読にできませんでした' });
      }
    }
    // 遷移先（§2.1）: シリーズ新着は該当再生リストの動画プレーヤーページ
    if (n.type === 'series_new_episode' && n.playlistId) router.push(`/playlists/${n.playlistId}`);
  }

  async function handleMarkAllRead() {
    if (!items) return;
    const unread = items.filter((n) => !n.isRead);
    if (unread.length === 0) return;
    setMarking(true);
    try {
      // writeBatch は 500 件まで。本人の未読はそれより十分少ない想定だが念のため分割する
      for (let i = 0; i < unread.length; i += 450) {
        const batch = writeBatch(db);
        unread.slice(i, i + 450).forEach((n) => batch.update(doc(db, 'notifications', n.id), { isRead: true }));
        await batch.commit();
      }
      setItems((prev) => prev?.map((n) => ({ ...n, isRead: true })) ?? prev);
      toast({ type: 'success', message: `${unread.length}件を既読にしました` });
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setMarking(false);
    }
  }

  async function handleRefresh() {
    setRefreshBusy(true);
    setRefreshResult(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/refresh-new-videos', { method: 'POST', headers: { Authorization: `Bearer ${idToken}` } });
      const body = await res.json();
      if (!res.ok) {
        setRefreshResult('再取得に失敗しました');
        return;
      }
      setRefreshResult(
        `確認済み ${body.playlistsChecked} 件中 ${body.playlistsWithNewVideos} 件に新着（動画 ${body.totalNewVideos} 本、通知 ${body.notificationsCreated} 件生成）`,
      );
      if (user) await load(user.uid);
    } catch {
      setRefreshResult('再取得に失敗しました');
    } finally {
      setRefreshBusy(false);
    }
  }

  if (loading || !user || items === null) {
    return <NotificationsSkeleton />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading>通知</SectionHeading>
        <Button variant="secondary" onClick={handleMarkAllRead} disabled={counts.unread === 0} loading={marking}>
          すべて既読にする
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<BellIcon />} title="通知はまだありません" description="マイリストに登録した再生リストに新しい動画が追加されると、ここでお知らせします" />
      ) : (
        <>
          <Tabs value={filter} onValueChange={(v) => changeFilter(v as Filter)}>
            <TabsList aria-label="通知の絞り込み">
              <TabsTrigger value="all" count={counts.all}>
                すべて
              </TabsTrigger>
              <TabsTrigger value="unread" count={counts.unread}>
                未読
              </TabsTrigger>
              <TabsTrigger value="series_new_episode" count={counts.series_new_episode}>
                シリーズ新着
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {visible.length === 0 ? (
            <p className="py-10 text-center text-base text-text-muted">該当する通知はありません</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {pageItems.map((n) => (
                <li key={n.id}>
                  <Card interactive flush>
                    <button
                      type="button"
                      onClick={() => handleOpen(n)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left md:px-[18px] md:py-[14px]"
                    >
                      <span className="flex w-[7px] shrink-0 justify-center pt-[7px]">{!n.isRead && <UnreadDot />}</span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex items-center justify-between gap-3">
                          <Tag emphasis={!n.isRead}>{TYPE_LABEL[n.type] ?? '通知'}</Tag>
                          <time dateTime={n.createdAt ? new Date(n.createdAt).toISOString() : undefined} title={formatAbsolute(n.createdAt)} className="shrink-0 text-sm text-text-muted">
                            {formatRelative(n.createdAt)}
                          </time>
                        </span>
                        <span className={cn('text-base leading-relaxed', n.isRead ? 'text-text-secondary' : 'text-text-primary')}>{n.message}</span>
                      </span>
                    </button>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          {pageCount > 1 && (
            <nav aria-label="ページ" className="flex items-center justify-center gap-1 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1} aria-label="前のページ">
                <ChevronLeftIcon size={14} />
              </Button>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <Button key={p} variant={p === currentPage ? 'secondary' : 'ghost'} size="sm" active={p === currentPage} onClick={() => setPage(p)} aria-current={p === currentPage ? 'page' : undefined}>
                  {p}
                </Button>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount} aria-label="次のページ">
                <ChevronRightIcon size={14} />
              </Button>
            </nav>
          )}
        </>
      )}

      {isAdmin && (
        // 管理画面（フェーズ3以降）ができるまでの暫定。目立たないよう下部に隔離
        <Card className="mt-6 flex flex-col gap-3 border-dashed">
          <p className="text-md font-medium text-text-muted">管理者用（暫定）</p>
          <p className="text-base text-text-secondary">
            マイリスト登録のある公開再生リストを YouTube から再取得し、新着動画があれば登録ユーザーに通知を生成します。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={handleRefresh} loading={refreshBusy}>
              新着動画を再取得
            </Button>
            {refreshResult && <span className="text-md text-text-muted">{refreshResult}</span>}
          </div>
        </Card>
      )}
    </div>
  );
}

function NotificationsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="読み込み中">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-[80px]" />
        <Skeleton className="h-9 w-[140px]" />
      </div>
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} flush className="px-[18px] py-[14px]">
          <SkeletonText lines={2} />
        </Card>
      ))}
    </div>
  );
}
