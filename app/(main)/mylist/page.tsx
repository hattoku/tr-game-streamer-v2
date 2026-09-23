'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMylistEntries, type MylistEntry } from '@/lib/mylist-entries';
import { LinkButton } from '@/components/ui/Button';
import { Card, CardChildArea, SectionHeading } from '@/components/ui/Card';
import { CountBadge } from '@/components/ui/Badge';
import { WATCH_STATUS_LABEL, WATCH_STATUS_OTHER, type WatchStatus } from '@/components/ui/Chip';
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
import { MylistCard } from '@/components/mylist/MylistCard';

// マイリストページ。document/specification/page/ページ マイリスト機能仕様書.md 準拠。
// フェーズ2.5ステップ5でデザイン適用（wiki/sources/2026-09-11-phase2.5-design-plan.md §4）。
// - フィルタタブ（§3: すべて／視聴中／見たい／完走／その他▼=一時中断・断念、件数バッジ）
// - ソート（§4: 最後に再生した動画（新しい順）＝watch_progress の最新 updatedAt、無い場合は mylist.updatedAt／
//   再生リスト名（昇順））
// - カード（§5: 親＝再生リスト情報・ステータス変更・逆順トグル・削除、子＝最後に再生した動画）
// - 空状態（§2.2）。未ログインはログインページへ（§1.2）
// データ取得（「最後に再生した動画」「最終話視聴済み」「新着動画あり」の判定を含む）は
// lib/mylist-entries.ts の fetchMylistEntries に切り出し、TOPページのマイリストセクション
// （components/top/MylistSection.tsx、フェーズ6ステップ2）と共用している。判定の詳細は同ファイル参照。
// スコープ外（据え置き）:
// - 新着通知の ON/OFF トグル（§5.4）: フェーズ4.5ステップ6で/settingsに実装したが、
//   showNewArrivalNotificationはFCMプッシュ通知の送信可否を絞るためのフィールド（FCMプッシュ通知
//   基盤仕様書参照）で、FCM自体が未実装のため現時点では見た目上の効果はない。in-app通知一覧
//   （notifications）の生成はこのフラグを見ずに常に行う仕様のため、マイリストページ側の対応は不要

type FilterValue = 'all' | WatchStatus;
type SortValue = 'lastPlayed' | 'titleAsc';

const OTHER_FILTERS = WATCH_STATUS_OTHER;
const SORT_OPTIONS: Array<{ value: SortValue; label: string }> = [
  { value: 'lastPlayed', label: '最後に再生した動画（新しい順）' },
  { value: 'titleAsc', label: '再生リスト名（昇順）' },
];

export default function MylistPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [entries, setEntries] = useState<MylistEntry[] | null>(null);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [sort, setSort] = useState<SortValue>('lastPlayed');

  // 未ログインはログインページへ（§1.2）
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    // 非同期 IIFE にして、effect 本体で同期的に setState しない形にする（react-hooks/set-state-in-effect）
    (async () => {
      try {
        setEntries(await fetchMylistEntries(uid));
      } catch (e) {
        console.error('マイリストの読み込みに失敗しました', e);
        setEntries([]);
        toast({ type: 'error', message: 'マイリストの読み込みに失敗しました' });
      }
    })();
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

  async function handleStatusChange(entry: MylistEntry, status: WatchStatus) {
    if (status === entry.watchStatus) return;
    try {
      await updateDoc(doc(db, 'mylist', entry.mylistId), { watchStatus: status, updatedAt: serverTimestamp() });
      setEntries((prev) => prev?.map((e) => (e.mylistId === entry.mylistId ? { ...e, watchStatus: status, updatedAt: Date.now() } : e)) ?? prev);
      toast({ type: 'success', message: `ステータスを「${WATCH_STATUS_LABEL[status]}」に変更しました` });
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    }
  }

  async function handleReverseToggle(entry: MylistEntry, value: boolean) {
    try {
      await updateDoc(doc(db, 'mylist', entry.mylistId), { isReverseOrder: value, updatedAt: serverTimestamp() });
      // 逆順を切り替えると「最終話」が変わるため読み直す
      if (user) setEntries(await fetchMylistEntries(user.uid));
      toast({ type: 'success', message: value ? '逆順で再生するように設定しました' : '本来の順序で再生するように設定しました' });
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    }
  }

  async function handleRemove(entry: MylistEntry) {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/mylist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ playlistId: entry.playlistId }),
      });
      if (!res.ok) throw new Error('failed to remove from mylist');
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
