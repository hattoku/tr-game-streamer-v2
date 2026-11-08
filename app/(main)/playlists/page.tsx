/**
 * 「再生リストを探す」（/playlists）。ページ 再生リストを探す 仕様書 準拠。
 * 絞り込み・並べ替え・ページングはサーバー側で行い、1ページ分（20件）だけ受け取る
 * （リブランディング段階7、共通 一覧のサーバー側検索 仕様書。API は app/api/catalog/playlists）。
 * キーワードは入力が止まってから300msで検索する（§4.2のデバウンス）。
 *
 * スコープ外・簡略化した点:
 * - タグ絞り込みの表示件数「実況スタイル系は全件、その他は上位5件+もっと見る」（§4.3）は、
 *   `tags`スキーマにカテゴリを表す情報が無いため`/games`と同じくフラットな一覧として実装する。
 *
 * 見出しの右に「再生リストを追加する」（/playlists/new。管理者は登録・一般ユーザーは提案）を置く（PCのみ。
 * モバイルは「さがす」4ページ共通の浮きボタン AddPlaylistFab）。
 *
 * TOPページからの流入（§1.3実装注記）: `?q=`（キーワード）・`?sort=`・`?tag=`を初回表示時にのみ
 * 初期値として読み込む（`/games`の`?tag=`と同じ遅延初期化パターン。以降のURL同期はしない）。
 */
'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PlaylistCardGrid } from '@/components/playlists/PlaylistGrid';
import { LoadError } from '@/components/playlists/PlaylistListSection';
import { fetchPlaylistPage, useCatalogQuery, useDebouncedValue } from '@/lib/catalog';
import { PLAYLIST_SORTS, type PlaylistSort } from '@/lib/catalog-shared';
import { fetchTagsMap, isListedTag, type TagInfo } from '@/lib/tags';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Button, LinkButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { SelectMenu } from '@/components/ui/DropdownMenu';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, InventoryIcon, SearchIcon, XIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';

const SORT_OPTIONS: Array<{ value: PlaylistSort; label: string }> = [
  { value: 'score', label: 'スコアが高い順' },
  { value: 'mylist', label: 'マイリスト登録者数順' },
  { value: 'newest', label: '新着順' },
];

export default function PlaylistsPage() {
  const searchParams = useSearchParams();

  const [tags, setTags] = useState<TagInfo[]>([]);
  // 絞り込み条件チップ用。?tag= で一覧に出ないユーザータグが選ばれていても表示・解除できるよう全タグを持つ
  const [allTags, setAllTags] = useState<Map<string, TagInfo>>(new Map());

  // TOPページからの流入用クエリパラメータ（?q=, ?sort=, ?tag=）。初回表示時にのみ読み込む
  const [keyword, setKeyword] = useState(() => searchParams.get('q') ?? '');
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(() => {
    const tagId = searchParams.get('tag');
    return tagId ? new Set([tagId]) : new Set();
  });
  const [showAllTags, setShowAllTags] = useState(false);
  const [sort, setSort] = useState<PlaylistSort>(() => {
    const s = searchParams.get('sort');
    return (PLAYLIST_SORTS as readonly string[]).includes(s ?? '') ? (s as PlaylistSort) : 'score';
  });
  const [page, setPage] = useState(1);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    fetchTagsMap().then((tagsMap) => {
      setAllTags(tagsMap);
      setTags([...tagsMap.values()].filter((t) => isListedTag(t, 'playlist')).sort((a, b) => a.name.localeCompare(b.name, 'ja')));
    });
  }, []);

  // 検索対象はゲームタイトル・チャンネル名（§4.2。再生リスト自身のタイトルは対象外）。照合はサーバー側
  const debouncedKeyword = useDebouncedValue(keyword.trim());
  const tagKey = [...selectedTagIds].sort().join(',');

  // 検索条件・ソートが変わったらページを1に戻す。「propが変わったらstateを調整する」パターンは
  // 描画中に直接setStateする（React公式の推奨。effect内でのsetStateは1テンポ余分な再描画を招く）
  const filterKey = `${debouncedKeyword}|${tagKey}|${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const { data, loading, error, retry } = useCatalogQuery(`${filterKey}|${page}`, (signal) =>
    fetchPlaylistPage({ keyword: debouncedKeyword, tagIds: tagKey ? tagKey.split(',') : [], sort, page }, signal),
  );
  // 入力中（デバウンス待ち）も読み込み中として薄く表示する
  const pending = loading || debouncedKeyword !== keyword.trim();

  const activeFilterCount = (keyword.trim() ? 1 : 0) + selectedTagIds.size;
  const visibleTags = showAllTags ? tags : tags.slice(0, 20);

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetFilters() {
    setKeyword('');
    setSelectedTagIds(new Set());
  }

  const activeFilterChips = activeFilterCount > 0 && (
    <div className="flex flex-wrap gap-2">
      {keyword.trim() && <FilterChip label={keyword.trim()} onRemove={() => setKeyword('')} />}
      {[...selectedTagIds]
        .map((id) => allTags.get(id))
        .filter((t): t is TagInfo => !!t)
        .map((t) => (
          <FilterChip key={t.id} label={t.name} onRemove={() => toggleTag(t.id)} />
        ))}
    </div>
  );

  const searchPanel = (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input
          type="text"
          placeholder="ゲームタイトル・チャンネル名で検索"
          aria-label="ゲームタイトル・チャンネル名で検索"
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

      {tags.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-md text-text-tertiary">タグで絞り込む</p>
          <div className="flex flex-wrap gap-2">
            {visibleTags.map((t) => (
              <FilterToggle key={t.id} label={t.name} selected={selectedTagIds.has(t.id)} onClick={() => toggleTag(t.id)} />
            ))}
          </div>
          {tags.length > 20 && (
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setShowAllTags((v) => !v)}>
              {showAllTags ? '閉じる' : 'もっと見る'}
            </Button>
          )}
        </div>
      )}

      <Button variant="secondary" size="sm" disabled={activeFilterCount === 0} onClick={resetFilters}>
        検索条件をリセット
      </Button>
    </div>
  );

  return (
    <div>
      {/* 「再生リストを追加する」導線（ページ 再生リストを追加する 仕様書 §1.4。一般ユーザーは提案、フェーズ7ステップ7-4） */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading>再生リストを探す</SectionHeading>
        {/* モバイルは「さがす」共通の浮きボタン（components/layout/AddPlaylistFab.tsx）が担う */}
        <div className="hidden md:block">
          <LinkButton href="/playlists/new" variant="secondary" size="sm">
            再生リストを追加する
          </LinkButton>
        </div>
      </div>

      {/* モバイル: アコーディオン形式の検索条件パネル（§7.1〜§7.3） */}
      <div className="mb-5 md:hidden">
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
          className="flex w-full items-center justify-between rounded-[12px] border border-border-card bg-gradient-card px-4 py-3 text-left"
        >
          <span className="inline-flex items-center gap-2 text-base text-text-primary">
            <SearchIcon size={15} />
            検索条件{activeFilterCount > 0 && `（${activeFilterCount}件適用中）`}
          </span>
          {panelOpen ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
        </button>
        {panelOpen && <Card className="mt-3">{searchPanel}</Card>}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[68fr_32fr]">
        <div className="flex flex-col gap-4">
          {activeFilterChips}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-md text-text-muted">{data ? `${data.total.toLocaleString()}件` : '\u00a0'}</span>
            <SelectMenu value={sort} onValueChange={setSort} options={SORT_OPTIONS} prefix="ソート:" aria-label="並び替え" />
          </div>

          {data === null ? (
            error ? (
              <LoadError onRetry={retry} />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Card key={i} flush>
                    <Skeleton className="aspect-video w-full rounded-none" />
                    <SkeletonText lines={2} className="p-3" />
                  </Card>
                ))}
              </div>
            )
          ) : (
            <>
              {error && <LoadError onRetry={retry} />}
              {data.total === 0 && !pending ? (
                activeFilterCount === 0 ? (
                  <EmptyState
                    icon={<InventoryIcon />}
                    title="まだ再生リストが登録されていません"
                    description="管理者が再生リストを登録すると、ここに表示されます"
                  />
                ) : (
                  <EmptyState
                    icon={<SearchIcon />}
                    title="お探しの再生リストは見つかりませんでした"
                    description="キーワードやフィルターを変えてみてください"
                    action={
                      <Button variant="secondary" onClick={resetFilters}>
                        検索条件をリセット
                      </Button>
                    }
                  />
                )
              ) : (
                <div aria-busy={pending} className={cn('flex flex-col gap-4 transition-opacity', pending && 'opacity-60')}>
                  <PlaylistCardGrid playlists={data.items} highlightTagIds={selectedTagIds} />
                  <Pagination page={data.page} pageCount={data.pageCount} onPageChange={setPage} />
                </div>
              )}
            </>
          )}
        </div>

        <Card className="hidden md:block">
          <p className="mb-4 text-lg font-medium text-text-primary">検索条件</p>
          {searchPanel}
        </Card>
      </div>
    </div>
  );
}

/**
 * タグ絞り込みバッジ（§4.3「選択済みの表示: ハイライトで選択状態を明示」）。
 * `/games`と同じくトグルボタン（境界線色＋塗りつぶし＋チェックアイコン）で選択状態を明示する
 */
function FilterToggle({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <Button variant="secondary" size="sm" active={selected} aria-pressed={selected} onClick={onClick}>
      {selected && <CheckIcon size={11} />}
      {label}
    </Button>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[20px] border border-border-chip bg-bg-input px-3 py-1 text-sm text-text-secondary">
      {label}
      <button
        type="button"
        aria-label={`${label}を解除`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-text-muted hover:text-text-primary"
      >
        <XIcon size={11} />
      </button>
    </span>
  );
}
