'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { LinkButton } from '@/components/ui/Button';
import { Card, CardChildArea, SectionHeading } from '@/components/ui/Card';
import { CountBadge } from '@/components/ui/Badge';
import { WATCH_STATUS_LABEL, type WatchStatus } from '@/components/ui/Chip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  SelectMenu,
} from '@/components/ui/DropdownMenu';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { ChevronDownIcon, FavoriteIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { MylistCard, type MylistCardData } from '@/components/mylist/MylistCard';

// マイリストページ。document/specification/page/ページ マイリスト機能仕様書.md 準拠。
// フェーズ2.5ステップ5でデザイン適用（wiki/sources/2026-09-11-phase2.5-design-plan.md §4）。
// - フィルタタブ（§3: すべて／視聴中／見たい／完走／その他▼=一時中断・断念、件数バッジ）
// - ソート（§4: 最後に再生した動画（新しい順）＝watch_progress の最新 updatedAt、無い場合は mylist.updatedAt／
//   再生リスト名（昇順））
// - カード（§5: 親＝再生リスト情報・ステータス変更・逆順トグル・削除、子＝最後に再生した動画）
// - 空状態（§2.2）。未ログインはログインページへ（§1.2）
// 「新着動画がある」判定は、未読の新着通知（notifications.type == 'series_new_episode'）がその再生リストに
// あるかで行う（新着通知バッチが playlists.videoCount を更新すると同時に通知を作るため。ユーザー通知機能仕様書）。
// 「最終話を視聴済み」判定は、最終話（逆順なら先頭）の watch_history.progressPercent が 95 以上。
// 最終話は videos を position == videoCount-1 の等価条件で引く（orderBy+limitToLast は降順の複合索引が要る）。
// スコープ外（据え置き）:
// - 新着通知の ON/OFF トグル（§5.4）: ユーザー設定ページが無いため常に ON
// - TOP ページ連携（§6）はフェーズ3

type FilterValue = 'all' | WatchStatus;
type SortValue = 'lastPlayed' | 'titleAsc';

const OTHER_FILTERS: WatchStatus[] = ['on_hold', 'dropped'];
const SORT_OPTIONS: Array<{ value: SortValue; label: string }> = [
  { value: 'lastPlayed', label: '最後に再生した動画（新しい順）' },
  { value: 'titleAsc', label: '再生リスト名（昇順）' },
];
const WATCHED_THRESHOLD = 95;

interface Entry extends MylistCardData {
  updatedAt: number;
  lastPlayedAt: number;
}

export default function MylistPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [sort, setSort] = useState<SortValue>('lastPlayed');

  // 未ログインはログインページへ（§1.2）
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  async function loadEntries(uid: string) {
    const [mylistSnap, progressSnap, historySnap, newSnap] = await Promise.all([
      getDocs(query(collection(db, 'mylist'), where('userId', '==', uid))),
      getDocs(query(collection(db, 'watch_progress'), where('userId', '==', uid))),
      getDocs(query(collection(db, 'watch_history'), where('userId', '==', uid))),
      getDocs(query(collection(db, 'notifications'), where('userId', '==', uid), where('isRead', '==', false))),
    ]);

    // 再生リストごとの最後に再生した動画（watch_progress の最新）
    const latestProgress = new Map<string, { youtubeVideoId: string; lastPlayedSeconds: number; updatedAt: number }>();
    progressSnap.docs.forEach((d) => {
      const data = d.data();
      const updatedAt = data.updatedAt?.toMillis?.() ?? 0;
      const prev = latestProgress.get(data.playlistId);
      if (!prev || updatedAt > prev.updatedAt) {
        latestProgress.set(data.playlistId, { youtubeVideoId: data.youtubeVideoId, lastPlayedSeconds: data.lastPlayedSeconds ?? 0, updatedAt });
      }
    });
    const historyPercent = new Map<string, number>();
    historySnap.docs.forEach((d) => historyPercent.set(d.data().youtubeVideoId, d.data().progressPercent ?? 0));
    const newPlaylistIds = new Set<string>();
    newSnap.docs.forEach((d) => {
      if (d.data().type === 'series_new_episode' && d.data().playlistId) newPlaylistIds.add(d.data().playlistId);
    });

    const rows = await Promise.all(
      mylistSnap.docs.map(async (d): Promise<Entry> => {
        const data = d.data();
        const playlistId: string = data.playlistId;
        const isReverseOrder: boolean = data.isReverseOrder ?? false;
        const progress = latestProgress.get(playlistId);

        const [playlistDoc, lastPlayedDoc] = await Promise.all([
          getDoc(doc(db, 'playlists', playlistId)),
          progress ? getDoc(doc(db, 'videos', `${playlistId}_${progress.youtubeVideoId}`)) : Promise.resolve(null),
        ]);

        // 最終話（逆順なら先頭）。position は 0 始まりで playlists.videoCount と同期しているため等価条件で引く
        // （orderBy + limitToLast は降順の複合索引を要求するため使わない）
        const videoCount: number = playlistDoc.exists() ? (playlistDoc.data().videoCount ?? 0) : 0;
        const lastPosition = isReverseOrder ? 0 : videoCount - 1;
        const lastVideoSnap =
          videoCount > 0
            ? await getDocs(query(collection(db, 'videos'), where('playlistId', '==', playlistId), where('position', '==', lastPosition), limit(1)))
            : null;
        const lastVideoId: string | undefined = lastVideoSnap?.docs[0]?.data().youtubeVideoId;
        const finished = lastVideoId != null && (historyPercent.get(lastVideoId) ?? 0) >= WATCHED_THRESHOLD;

        let lastPlayed: MylistCardData['lastPlayed'] = null;
        if (progress && lastPlayedDoc?.exists() && !finished) {
          const v = lastPlayedDoc.data();
          const duration: number | null = v.durationSeconds ?? null;
          const percent =
            historyPercent.get(progress.youtubeVideoId) ??
            (duration ? Math.min(100, Math.round((progress.lastPlayedSeconds / duration) * 100)) : 0);
          lastPlayed = {
            title: v.title,
            thumbnailUrl: v.thumbnailUrl,
            percent,
            remainingSeconds: duration != null ? Math.max(0, duration - progress.lastPlayedSeconds) : null,
          };
        }

        return {
          mylistId: d.id,
          playlistId,
          watchStatus: (data.watchStatus as WatchStatus) ?? 'want_to_watch',
          isReverseOrder,
          updatedAt: data.updatedAt?.toMillis?.() ?? 0,
          lastPlayedAt: progress?.updatedAt ?? 0,
          playlist: playlistDoc.exists()
            ? {
                title: playlistDoc.data().title,
                thumbnailUrl: playlistDoc.data().thumbnailUrl,
                channelName: playlistDoc.data().channelName,
                channelIconUrl: playlistDoc.data().channelIconUrl,
                videoCount: playlistDoc.data().videoCount ?? 0,
              }
            : null,
          lastPlayed,
          hasNew: newPlaylistIds.has(playlistId),
        };
      }),
    );
    setEntries(rows);
  }

  useEffect(() => {
    if (!user) return;
    loadEntries(user.uid).catch((e) => {
      console.error('マイリストの読み込みに失敗しました', e);
      setEntries([]);
      toast({ type: 'error', message: 'マイリストの読み込みに失敗しました' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const counts = useMemo(() => {
    const c: Record<FilterValue, number> = { all: 0, watching: 0, want_to_watch: 0, completed: 0, on_hold: 0, dropped: 0 };
    for (const e of entries ?? []) {
      c.all++;
      c[e.watchStatus]++;
    }
    return c;
  }, [entries]);

  const visibleEntries = useMemo(() => {
    const list = entries ?? [];
    const filtered = filter === 'all' ? list : list.filter((e) => e.watchStatus === filter);
    const sorted = [...filtered];
    if (sort === 'titleAsc') {
      sorted.sort((a, b) => (a.playlist?.title ?? '').localeCompare(b.playlist?.title ?? '', 'ja'));
    } else {
      // 最後に再生した動画（新しい順）。再生履歴が無いものは登録・更新日時で後ろに並べる
      sorted.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt || b.updatedAt - a.updatedAt);
    }
    return sorted;
  }, [entries, filter, sort]);

  async function handleStatusChange(entry: Entry, status: WatchStatus) {
    if (status === entry.watchStatus) return;
    try {
      await updateDoc(doc(db, 'mylist', entry.mylistId), { watchStatus: status, updatedAt: serverTimestamp() });
      setEntries((prev) => prev?.map((e) => (e.mylistId === entry.mylistId ? { ...e, watchStatus: status, updatedAt: Date.now() } : e)) ?? prev);
      toast({ type: 'success', message: `ステータスを「${WATCH_STATUS_LABEL[status]}」に変更しました` });
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    }
  }

  async function handleReverseToggle(entry: Entry, value: boolean) {
    try {
      await updateDoc(doc(db, 'mylist', entry.mylistId), { isReverseOrder: value, updatedAt: serverTimestamp() });
      // 逆順を切り替えると「最終話」が変わるため読み直す
      if (user) await loadEntries(user.uid);
      toast({ type: 'success', message: value ? '逆順で再生するように設定しました' : '本来の順序で再生するように設定しました' });
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    }
  }

  async function handleRemove(entry: Entry) {
    try {
      await deleteDoc(doc(db, 'mylist', entry.mylistId));
      setEntries((prev) => prev?.filter((e) => e.mylistId !== entry.mylistId) ?? prev);
      toast({ type: 'success', message: 'マイリストから削除しました' });
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    }
  }

  if (loading || !user || entries === null) {
    return <MylistSkeleton />;
  }

  const otherActive = OTHER_FILTERS.includes(filter as WatchStatus);
  const otherCount = counts.on_hold + counts.dropped;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading>マイリスト</SectionHeading>

      {entries.length === 0 ? (
        // 空状態（§2.2、UIコンポーネント仕様書 §8）
        <EmptyState
          icon={<FavoriteIcon />}
          title="マイリストは空です"
          description="気になる動画をマイリストに追加して、自分だけのリストを作りましょう"
          action={
            <LinkButton href="/playlists" variant="primary">
              動画を探す
            </LinkButton>
          }
        />
      ) : (
        <>
          {/* フィルタタブ（§3）＋ソート（§4）。「その他▼」はドロップダウン（一時中断・断念） */}
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
            <TabsList
              aria-label="視聴ステータスで絞り込み"
              trailing={
                <SelectMenu
                  value={sort}
                  onValueChange={setSort}
                  options={SORT_OPTIONS}
                  prefix="ソート:"
                  aria-label="並び順"
                />
              }
            >
              <TabsTrigger value="all" count={counts.all}>
                すべて
              </TabsTrigger>
              <TabsTrigger value="watching" count={counts.watching}>
                視聴中
              </TabsTrigger>
              <TabsTrigger value="want_to_watch" count={counts.want_to_watch}>
                見たい
              </TabsTrigger>
              <TabsTrigger value="completed" count={counts.completed}>
                完走
              </TabsTrigger>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="その他のステータスで絞り込み"
                  className={cn(
                    '-mb-px inline-flex items-center gap-1 whitespace-nowrap border-b-2 px-3 py-[10px] text-base transition-[color,border-color] duration-[120ms] hover:text-text-primary md:px-[14px]',
                    otherActive ? 'border-border-active font-semibold text-text-primary' : 'border-transparent text-text-tertiary',
                  )}
                >
                  {otherActive ? `その他: ${WATCH_STATUS_LABEL[filter as WatchStatus]}` : 'その他'}
                  <ChevronDownIcon size={12} />
                  <CountBadge count={otherActive ? counts[filter] : otherCount} active={otherActive} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup value={otherActive ? filter : ''} onValueChange={(v) => setFilter(v as FilterValue)}>
                    {OTHER_FILTERS.map((s) => (
                      <DropdownMenuRadioItem key={s} value={s}>
                        {WATCH_STATUS_LABEL[s]}
                        <CountBadge count={counts[s]} />
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </TabsList>
          </Tabs>

          {visibleEntries.length === 0 ? (
            <p className="py-10 text-center text-base text-text-muted">
              「{filter === 'all' ? 'すべて' : WATCH_STATUS_LABEL[filter as WatchStatus]}」の再生リストはありません
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {visibleEntries.map((entry) => (
                <li key={entry.mylistId}>
                  <MylistCard
                    entry={entry}
                    onStatusChange={(s) => handleStatusChange(entry, s)}
                    onReverseToggle={(v) => handleReverseToggle(entry, v)}
                    onRemove={() => handleRemove(entry)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function MylistSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="読み込み中">
      <Skeleton className="h-6 w-[120px]" />
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} flush>
          <div className="flex gap-3 p-3 md:gap-[18px] md:p-[18px]">
            <Skeleton className="aspect-video w-[128px] shrink-0 md:w-[224px]" />
            <SkeletonText lines={3} className="flex-1" />
          </div>
          <CardChildArea className="px-3 md:px-[18px]">
            <div className="flex items-center gap-3">
              <Skeleton className="aspect-video w-[96px] shrink-0 md:w-[124px]" />
              <SkeletonText lines={2} className="flex-1" />
            </div>
          </CardChildArea>
        </Card>
      ))}
    </div>
  );
}
