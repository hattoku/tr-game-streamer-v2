/**
 * 「チャンネル名から探す」（/channels）。ページ チャンネル 探す 仕様書 準拠。
 * `/games`と同じ簡易実装方針: `channels`全件＋公開`playlists`の集計（lib/playlist-aggregates.ts）を
 * クライアントで取得し、キーワード絞り込み・ソート・20件ページングもクライアント側で行う。
 *
 * 簡略化した点:
 * - キーワード検索の「デバウンス300ms」（§4.2）はクライアント内メモリ配列のフィルタのため実施しない（`/games`と同じ）。
 * - 再生リスト登録数は`channels.playlistCount`（登録APIが維持）、動画数・ピックアップは公開再生リストからの集計値。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { fetchChannelAggregates } from '@/lib/playlist-aggregates';
import { ChannelListCard, type ChannelCardData } from '@/components/channels/ChannelListCard';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { SelectMenu } from '@/components/ui/DropdownMenu';
import { SearchIcon, UserIcon, XIcon } from '@/components/ui/icons';

const PAGE_SIZE = 20;

type SortKey = 'playlistCount' | 'name' | 'videoCount';
const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'playlistCount', label: '再生リスト登録数順' },
  { value: 'name', label: 'チャンネル名順' },
  { value: 'videoCount', label: '動画数順' },
];

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelCardData[] | null>(null);
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<SortKey>('playlistCount');
  const [page, setPage] = useState(1);

  useEffect(() => {
    Promise.all([getDocs(collection(db, 'channels')), fetchChannelAggregates()]).then(([snap, aggregates]) => {
      setChannels(
        snap.docs.map((d) => {
          const data = d.data();
          const agg = aggregates.get(d.id);
          return {
            id: d.id,
            name: (data.name as string) ?? '',
            iconUrl: (data.iconUrl as string) ?? '',
            playlistCount: (data.playlistCount as number) ?? 0,
            videoCount: agg?.videoCount ?? 0,
            topPlaylists: agg?.topPlaylists ?? [],
          } satisfies ChannelCardData;
        }),
      );
    });
  }, []);

  const filtered = useMemo(() => {
    if (!channels) return [];
    const kw = keyword.trim().toLowerCase();
    return kw ? channels.filter((c) => c.name.toLowerCase().includes(kw)) : channels;
  }, [channels, keyword]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'ja');
      const diff = sort === 'videoCount' ? b.videoCount - a.videoCount : b.playlistCount - a.playlistCount;
      // 同数はチャンネル名順（§5.2）
      return diff !== 0 ? diff : a.name.localeCompare(b.name, 'ja');
    });
    return list;
  }, [filtered, sort]);

  // 検索条件・ソートが変わったらページを1に戻す（`/games`と同じ「描画中に直接setState」パターン）
  const filterKey = `${keyword}|${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasKeyword = keyword.trim().length > 0;

  const keywordInput = (
    <div className="relative">
      <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
      <Input
        type="text"
        placeholder="チャンネル名で検索"
        aria-label="チャンネル名で検索"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        className="pl-9 pr-9"
      />
      {keyword && (
        <button
          type="button"
          aria-label="キーワードをクリア"
          onClick={() => setKeyword('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
        >
          <XIcon size={14} />
        </button>
      )}
    </div>
  );

  return (
    <div>
      <SectionHeading className="mb-5">チャンネル名から探す</SectionHeading>

      {/* モバイル: 検索条件はキーワードのみのためアコーディオンにせず常時表示（§7.1） */}
      <div className="mb-5 md:hidden">{keywordInput}</div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[68fr_32fr]">
        {/* min-w-0: fr単位のグリッドアイテムはmin-width初期値がautoのため、無いと長いチャンネル名で
            トラック幅が押し広げられオーバーフローする（wiki/concepts/CSSグリッドのmin-width対策.md参照） */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-md text-text-muted">{sorted.length}件</span>
            <SelectMenu value={sort} onValueChange={setSort} options={SORT_OPTIONS} prefix="ソート:" aria-label="並び替え" />
          </div>

          {channels === null ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="flex gap-3">
                  <Skeleton className="size-[72px] shrink-0 rounded-[10px]" />
                  <SkeletonText lines={2} className="flex-1" />
                </Card>
              ))}
            </div>
          ) : channels.length === 0 ? (
            <EmptyState
              icon={<UserIcon />}
              title="まだチャンネルが登録されていません"
              description="再生リストを登録すると、そのチャンネルがここに表示されます"
            />
          ) : sorted.length === 0 ? (
            <EmptyState
              icon={<SearchIcon />}
              title="該当するチャンネルが見つかりませんでした"
              description="検索条件を変えてお試しください"
              action={
                <Button variant="secondary" onClick={() => setKeyword('')}>
                  検索条件をリセット
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {pageItems.map((c) => (
                  <ChannelListCard key={c.id} channel={c} />
                ))}
              </div>
              <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
            </>
          )}
        </div>

        <Card className="hidden min-w-0 md:block">
          <p className="mb-4 text-lg font-medium text-text-primary">検索条件</p>
          <div className="flex flex-col gap-5">
            {keywordInput}
            <Button variant="secondary" size="sm" disabled={!hasKeyword} onClick={() => setKeyword('')}>
              検索条件をリセット
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
