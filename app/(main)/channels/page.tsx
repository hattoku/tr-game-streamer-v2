/**
 * 「チャンネル名から探す」（/channels）。ページ チャンネル 探す 仕様書 準拠。
 * キーワード絞り込み・ソート・20件ページングはサーバー側で行い、1ページ分だけ受け取る
 * （リブランディング段階7、共通 一覧のサーバー側検索 仕様書。API は app/api/catalog/channels）。
 * 再生リスト数・動画数・ピックアップは、掲載中の再生リストからサーバーが集計した値。
 * キーワードは入力が止まってから300msで検索する（§4.2のデバウンス）。
 */
'use client';

import { useState } from 'react';
import { ChannelListCard } from '@/components/channels/ChannelListCard';
import { LoadError } from '@/components/playlists/PlaylistListSection';
import { fetchChannelPage, useCatalogQuery, useDebouncedValue } from '@/lib/catalog';
import type { ChannelSort } from '@/lib/catalog-shared';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { SelectMenu } from '@/components/ui/DropdownMenu';
import { SearchIcon, UserIcon, XIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';

type SortKey = ChannelSort;
const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'playlistCount', label: '再生リスト登録数順' },
  { value: 'name', label: 'チャンネル名順' },
  { value: 'videoCount', label: '動画数順' },
];

export default function ChannelsPage() {
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<SortKey>('playlistCount');
  const [page, setPage] = useState(1);

  const debouncedKeyword = useDebouncedValue(keyword.trim());

  // 検索条件・ソートが変わったらページを1に戻す（`/games`と同じ「描画中に直接setState」パターン）
  const filterKey = `${debouncedKeyword}|${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const { data, loading, error, retry } = useCatalogQuery(`${filterKey}|${page}`, (signal) =>
    fetchChannelPage({ keyword: debouncedKeyword, sort, page }, signal),
  );
  const pending = loading || debouncedKeyword !== keyword.trim();
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
            <span className="text-md text-text-muted">{data ? `${data.total.toLocaleString()}件` : '\u00a0'}</span>
            <SelectMenu value={sort} onValueChange={setSort} options={SORT_OPTIONS} prefix="ソート:" aria-label="並び替え" />
          </div>

          {data === null ? (
            error ? (
              <LoadError onRetry={retry} />
            ) : (
              <div className="flex flex-col gap-3" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="flex gap-3">
                    <Skeleton className="size-[72px] shrink-0 rounded-[10px]" />
                    <SkeletonText lines={2} className="flex-1" />
                  </Card>
                ))}
              </div>
            )
          ) : (
            <>
              {error && <LoadError onRetry={retry} />}
              {data.total === 0 && !pending ? (
                !hasKeyword ? (
                  <EmptyState
                    icon={<UserIcon />}
                    title="まだチャンネルが登録されていません"
                    description="再生リストを登録すると、そのチャンネルがここに表示されます"
                  />
                ) : (
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
                )
              ) : (
                <div aria-busy={pending} className={cn('flex flex-col gap-4 transition-opacity', pending && 'opacity-60')}>
                  <div className="flex flex-col gap-3">
                    {data.items.map((c) => (
                      <ChannelListCard key={c.id} channel={c} />
                    ))}
                  </div>
                  <Pagination page={data.page} pageCount={data.pageCount} onPageChange={setPage} />
                </div>
              )}
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
