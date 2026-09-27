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

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMylistEntries } from '@/components/mylist/useMylistEntries';
import { Carousel, CarouselItem } from '@/components/ui/Carousel';
import { Skeleton } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/Card';
import { Button, LinkButton } from '@/components/ui/Button';
import { AlertIcon, FavoriteIcon } from '@/components/ui/icons';
import { TopMylistCard } from '@/components/top/TopMylistCard';
import { SectionHeaderRow } from '@/components/top/SectionHeaderRow';
import { useCarouselNav } from '@/components/top/useCarouselNav';

export function MylistSection() {
  const { user } = useAuth();
  // タイムアウト・自動リトライ・画面復帰時の再取得はフック側（useMylistEntries 冒頭コメント参照）
  const { entries, error } = useMylistEntries(user?.uid ?? null);

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

      {error ? (
        // 読み込み失敗（§5.7）。空状態と区別する。止まったFirestore接続上での再試行では直らないことがあるため
        // ページごと再読み込みする
        <Card flush className="flex flex-col items-center gap-4 px-6 py-8 text-center md:flex-row md:gap-5 md:text-left">
          <div
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-bg-btn text-text-muted [&>svg]:size-6"
          >
            <AlertIcon />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-xl font-medium text-text-primary">マイリストを読み込めませんでした</p>
            <p className="text-base text-text-muted">通信状況をご確認のうえ、再読み込みしてください</p>
          </div>
          <Button variant="secondary" className="shrink-0" onClick={() => window.location.reload()}>
            再読み込み
          </Button>
        </Card>
      ) : entries === null ? (
        <div className="flex gap-4 overflow-hidden" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video w-[240px] shrink-0 rounded-[12px] md:w-[280px]" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        // 空状態（§5.6）。共通EmptyStateはページ全体向けで大きいため、セクション用のコンパクトなパネルにする
        // （モバイルは縦積み・中央揃え、md以上は アイコン｜テキスト｜ボタン の横並び）
        <Card flush className="flex flex-col items-center gap-4 px-6 py-8 text-center md:flex-row md:gap-5 md:text-left">
          <div
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-bg-btn text-text-muted [&>svg]:size-6"
          >
            <FavoriteIcon />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-xl font-medium text-text-primary">マイリストはまだ空です</p>
            <p className="text-base text-text-muted">
              気になる再生リストをマイリストに追加すると、ここから続きをすぐに再生できます
            </p>
          </div>
          <LinkButton href="/playlists" variant="primary" className="shrink-0">
            再生リストを探す
          </LinkButton>
        </Card>
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
