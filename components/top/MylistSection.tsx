/**
 * TOPページ マイリストセクション（ログイン済み時のみ、ページ top 仕様書 §5）。
 * 視聴中・完走済みを問わずマイリスト登録済みの再生リストを1セクションにまとめ、
 * 「完走済み・新着なし」のみカルーセルから除外する（§5.4）。並び順は「最後に再生した動画が新しい順」
 * （マイリストページのデフォルトソートに準ずる。§5.3）。
 * ヘッダー行・送りボタンは他3セクション（注目・新着・タグピックアップ、`TopSection`使用）と
 * `SectionHeaderRow`・`useCarouselNav`で共通化している（空状態・読み込み中の分岐を持つため
 * `TopSection`自体は使わないが、見た目・挙動は揃える）。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMylistEntries, type MylistEntry } from '@/lib/mylist-entries';
import { Carousel, CarouselItem } from '@/components/ui/Carousel';
import { Skeleton } from '@/components/ui/Skeleton';
import { TopMylistCard } from '@/components/top/TopMylistCard';
import { SectionHeaderRow } from '@/components/top/SectionHeaderRow';
import { useCarouselNav } from '@/components/top/useCarouselNav';

export function MylistSection() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<MylistEntry[] | null>(null);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    (async () => {
      try {
        setEntries(await fetchMylistEntries(uid));
      } catch (e) {
        console.error('マイリストの読み込みに失敗しました', e);
        setEntries([]);
      }
    })();
  }, [user]);

  // 完走済みかつ新着なしはカルーセルに表示しない（§5.4）
  const visible = useMemo(
    () => (entries ?? []).filter((e) => !(e.watchStatus === 'completed' && !e.hasNew)),
    [entries],
  );
  const sorted = useMemo(
    () => [...visible].sort((a, b) => b.lastPlayedAt - a.lastPlayedAt || b.updatedAt - a.updatedAt),
    [visible],
  );

  const { scrollRef, atStart, atEnd, updateEdges, scrollByPage } = useCarouselNav(sorted);

  if (!user) return null;

  return (
    <section className="flex flex-col gap-4">
      <SectionHeaderRow
        title="マイリスト"
        viewAllHref="/mylist"
        // カルーセルが無い（読み込み中・空状態）間は送りボタンを出さない
        nav={sorted.length > 0 ? { atStart, atEnd, onPrev: () => scrollByPage(-1), onNext: () => scrollByPage(1) } : null}
      />

      {entries === null ? (
        <div className="flex gap-4 overflow-hidden" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video w-[240px] shrink-0 rounded-[12px] md:w-[280px]" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        // 空状態（§5.6）
        <p className="text-base text-text-muted">
          マイリストに再生リストを追加すると、ここに表示されます{' '}
          <Link href="/playlists" className="text-text-secondary hover:text-text-primary">
            再生リストを探す →
          </Link>
        </p>
      ) : (
        <Carousel ref={scrollRef} ariaLabel="マイリスト" onScroll={updateEdges}>
          {sorted.map((entry) => (
            <CarouselItem key={entry.mylistId}>
              <TopMylistCard entry={entry} className="block h-full" />
            </CarouselItem>
          ))}
        </Carousel>
      )}
    </section>
  );
}
