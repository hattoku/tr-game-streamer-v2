/**
 * 「再生リストを探す」仕様書と同一カード（PlaylistCardGrid）で、ゲームタイトル・チャンネルに属する再生リストを
 * ソート（スコアが高い順・マイリスト登録者数順・新着順）＋20件/ページのページネーションで一覧表示する
 * セクション。ゲームタイトル詳細の「関連する再生リスト」（components/games/GamePlaylistSection.tsx）と
 * チャンネル詳細の「再生リスト一覧」（app/(main)/channels/[channelId]/page.tsx）で共用する
 * （ページ ゲームタイトル 詳細仕様書 第4章・第5章／ページ チャンネル 詳細 仕様書 第4章・第5章）。
 * 並べ替えとページ送りはサーバー側で行い、1ページ分だけ受け取る（リブランディング段階7、共通 一覧のサーバー側検索 仕様書）。
 */
'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button, LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { SelectMenu } from '@/components/ui/DropdownMenu';
import { InventoryIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { PlaylistCardGrid } from '@/components/playlists/PlaylistGrid';
import { fetchPlaylistPage, useCatalogQuery } from '@/lib/catalog';
import type { PlaylistSort } from '@/lib/catalog-shared';

const SORT_OPTIONS: Array<{ value: PlaylistSort; label: string }> = [
  { value: 'score', label: 'スコアが高い順' },
  { value: 'mylist', label: 'マイリスト登録者数順' },
  { value: 'newest', label: '新着順' },
];

export interface PlaylistTotals {
  /** 掲載中の再生リスト数 */
  total: number;
  /** その動画数の合計 */
  totalVideoCount: number;
}

interface PlaylistListSectionProps {
  title: string;
  /** どのゲームタイトル・チャンネルの再生リストか（どちらか一方） */
  filter: { gameId: string } | { channelId: string };
  /** 「再生リストを追加する」導線の遷移先（gameId / channelId のプレフィル付き） */
  addHref: string;
  addLabel?: string;
  /** 件数と動画数の合計を受け取ったとき（詳細ページの見出しの「N 再生リスト」「N 動画」に使う） */
  onTotals?: (totals: PlaylistTotals) => void;
}

export function PlaylistListSection({ title, filter, addHref, addLabel = '再生リストを追加する', onTotals }: PlaylistListSectionProps) {
  const [sort, setSort] = useState<PlaylistSort>('score');
  const [page, setPage] = useState(1);

  // ソートが変わったらページを1に戻す（描画中に直接setStateする。ReviewList等と同じ対応）
  const [prevSort, setPrevSort] = useState(sort);
  if (sort !== prevSort) {
    setPrevSort(sort);
    setPage(1);
  }

  const gameId = 'gameId' in filter ? filter.gameId : undefined;
  const channelId = 'channelId' in filter ? filter.channelId : undefined;
  const key = `${gameId ?? ''}|${channelId ?? ''}|${sort}|${page}`;
  const { data, loading, error, retry } = useCatalogQuery(key, (signal) => fetchPlaylistPage({ gameId, channelId, sort, page }, signal));

  useEffect(() => {
    if (data) onTotals?.({ total: data.total, totalVideoCount: data.totalVideoCount });
  }, [data, onTotals]);

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>{title}</CardTitle>

      {data === null ? (
        error ? (
          <LoadError onRetry={retry} />
        ) : (
          <Skeleton className="h-40 w-full" />
        )
      ) : data.total === 0 ? (
        <EmptyState
          icon={<InventoryIcon />}
          title="まだ登録されている再生リストがありません"
          description="最初の再生リストを登録してみませんか？"
          action={<LinkButton href={addHref}>{addLabel}</LinkButton>}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-md text-text-muted">{data.total.toLocaleString()}件</span>
              <SelectMenu value={sort} onValueChange={setSort} options={SORT_OPTIONS} prefix="ソート:" aria-label="並び替え" />
            </div>
            <LinkButton href={addHref} variant="secondary" size="sm">
              {addLabel}
            </LinkButton>
          </div>
          {error && <LoadError onRetry={retry} />}
          <div aria-busy={loading} className={cn('transition-opacity', loading && 'opacity-60')}>
            <PlaylistCardGrid playlists={data.items} />
          </div>
          <Pagination page={data.page} pageCount={data.pageCount} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}

/** 一覧 API が失敗したとき（共通 一覧のサーバー側検索 仕様書 §5.3） */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border-card px-4 py-3 text-md text-text-secondary">
      <span>一覧を読み込めませんでした。時間をおいてもう一度お試しください。</span>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        再読み込み
      </Button>
    </div>
  );
}
