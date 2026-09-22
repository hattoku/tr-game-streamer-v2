/**
 * 「再生リストを探す」仕様書と同一カード（PlaylistCardGrid）で、呼び出し側が用意した再生リストを
 * ソート（スコアが高い順・マイリスト登録者数順・新着順）＋20件/ページのページネーションで一覧表示する
 * セクション。ゲームタイトル詳細の「関連する再生リスト」（components/games/GamePlaylistSection.tsx）と
 * チャンネル詳細の「再生リスト一覧」（app/(main)/channels/[channelId]/page.tsx）で共用する
 * （ページ ゲームタイトル 詳細仕様書 第4章・第5章／ページ チャンネル 詳細 仕様書 第4章・第5章）。
 */
'use client';

import { useMemo, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { SelectMenu } from '@/components/ui/DropdownMenu';
import { InventoryIcon } from '@/components/ui/icons';
import { PlaylistCardGrid, sortPlaylists, type PlaylistSort, type PlaylistSummary } from '@/components/playlists/PlaylistGrid';

const PAGE_SIZE = 20;

const SORT_OPTIONS: Array<{ value: PlaylistSort; label: string }> = [
  { value: 'score', label: 'スコアが高い順' },
  { value: 'mylist', label: 'マイリスト登録者数順' },
  { value: 'newest', label: '新着順' },
];

interface PlaylistListSectionProps {
  title: string;
  /** null は読み込み中 */
  playlists: PlaylistSummary[] | null;
  /** 「再生リストを追加する」導線の遷移先（gameId / channelId のプレフィル付き） */
  addHref: string;
  addLabel?: string;
}

export function PlaylistListSection({ title, playlists, addHref, addLabel = '再生リストを追加する' }: PlaylistListSectionProps) {
  const [sort, setSort] = useState<PlaylistSort>('score');
  const [page, setPage] = useState(1);

  // ソートが変わったらページを1に戻す（描画中に直接setStateする。ReviewList等と同じ対応）
  const [prevSort, setPrevSort] = useState(sort);
  if (sort !== prevSort) {
    setPrevSort(sort);
    setPage(1);
  }

  const sorted = useMemo(() => (playlists ? sortPlaylists(playlists, sort) : []), [playlists, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>{title}</CardTitle>

      {playlists === null ? (
        <Skeleton className="h-40 w-full" />
      ) : playlists.length === 0 ? (
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
              <span className="text-md text-text-muted">{sorted.length}件</span>
              <SelectMenu value={sort} onValueChange={setSort} options={SORT_OPTIONS} prefix="ソート:" aria-label="並び替え" />
            </div>
            <LinkButton href={addHref} variant="secondary" size="sm">
              {addLabel}
            </LinkButton>
          </div>
          <PlaylistCardGrid playlists={pageItems} />
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}
