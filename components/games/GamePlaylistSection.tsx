/**
 * ゲームタイトル詳細ページ「関連する再生リスト」セクション
 * （ページ ゲームタイトル 詳細仕様書 第4章・第5章）。
 * カードは「再生リストを探す」仕様書と同一（PlaylistCardGrid）を再利用し、このゲームに
 * 紐づく公開再生リストのみを対象に、ソート（スコアが高い順・マイリスト登録者数順・新着順）と
 * 20件/ページのページネーションを行う。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { SelectMenu } from '@/components/ui/DropdownMenu';
import { InventoryIcon } from '@/components/ui/icons';
import {
  PlaylistCardGrid,
  fetchPlaylistsByGame,
  sortPlaylists,
  type PlaylistSort,
  type PlaylistSummary,
} from '@/components/playlists/PlaylistGrid';

const PAGE_SIZE = 20;

const SORT_OPTIONS: Array<{ value: PlaylistSort; label: string }> = [
  { value: 'score', label: 'スコアが高い順' },
  { value: 'mylist', label: 'マイリスト登録者数順' },
  { value: 'newest', label: '新着順' },
];

export function GamePlaylistSection({ gameId }: { gameId: string }) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [sort, setSort] = useState<PlaylistSort>('score');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchPlaylistsByGame(gameId).then(setPlaylists);
  }, [gameId]);

  // ソートが変わったらページを1に戻す（描画中に直接setStateする。ReviewList等と同じ対応）
  const [prevSort, setPrevSort] = useState(sort);
  if (sort !== prevSort) {
    setPrevSort(sort);
    setPage(1);
  }

  const sorted = useMemo(() => (playlists ? sortPlaylists(playlists, sort) : []), [playlists, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 「再生リストを追加する」導線: 一般ユーザー向け提案フローは未実装のため、
  // 現時点では管理者専用の登録ページへ共通で遷移させる（gameIdを引き継いで事前選択する）
  const addHref = `/playlists/new?gameId=${encodeURIComponent(gameId)}`;

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>関連する再生リスト</CardTitle>

      {playlists === null ? (
        <Skeleton className="h-40 w-full" />
      ) : playlists.length === 0 ? (
        <EmptyState
          icon={<InventoryIcon />}
          title="まだ登録されている再生リストがありません"
          description="最初の再生リストを登録してみませんか？"
          action={<LinkButton href={addHref}>再生リストを追加する</LinkButton>}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-md text-text-muted">{sorted.length}件</span>
              <SelectMenu value={sort} onValueChange={setSort} options={SORT_OPTIONS} prefix="ソート:" aria-label="並び替え" />
            </div>
            <LinkButton href={addHref} variant="secondary" size="sm">
              再生リストを追加する
            </LinkButton>
          </div>
          <PlaylistCardGrid playlists={pageItems} />
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}
