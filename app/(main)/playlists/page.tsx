/**
 * 「再生リストを探す」（/playlists）。ページ 再生リストを探す 仕様書 準拠。
 * カタログ規模が小さい前提で、全件クライアント取得＋クライアント側フィルタ・ソート・
 * ページングで実装する（`/games`と同じ簡易実装方針。フェーズ3時点では全文検索インフラは持たない）。
 *
 * スコープ外・簡略化した点:
 * - タグ絞り込みの表示件数「実況スタイル系は全件、その他は上位5件+もっと見る」（§4.3）は、
 *   `tags`スキーマにカテゴリを表す情報が無いため`/games`と同じくフラットな一覧として実装する。
 * - キーワード検索の「デバウンス300ms」（§4.2）はクライアント内メモリ配列のフィルタのため実施しない
 *   （`/games`と同じ判断）。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchPublicPlaylists, PlaylistCardGrid, sortPlaylists, type PlaylistSort, type PlaylistSummary } from '@/components/playlists/PlaylistGrid';
import { fetchTagsMap, type TagInfo } from '@/lib/tags';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { SelectMenu } from '@/components/ui/DropdownMenu';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, InventoryIcon, SearchIcon, XIcon } from '@/components/ui/icons';

const PAGE_SIZE = 20;

const SORT_OPTIONS: Array<{ value: PlaylistSort; label: string }> = [
  { value: 'score', label: 'スコアが高い順' },
  { value: 'mylist', label: 'マイリスト登録者数順' },
  { value: 'newest', label: '新着順' },
];

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [tags, setTags] = useState<TagInfo[]>([]);

  const [keyword, setKeyword] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [showAllTags, setShowAllTags] = useState(false);
  const [sort, setSort] = useState<PlaylistSort>('score');
  const [page, setPage] = useState(1);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    Promise.all([fetchPublicPlaylists(), fetchTagsMap()]).then(([list, tagsMap]) => {
      setPlaylists(list);
      setTags([...tagsMap.values()].filter((t) => t.usagePlaylistCount > 0).sort((a, b) => a.name.localeCompare(b.name, 'ja')));
    });
  }, []);

  const filtered = useMemo(() => {
    if (!playlists) return [];
    const kw = keyword.trim().toLowerCase();
    return playlists.filter((p) => {
      // 検索対象はゲームタイトル・チャンネル名（§4.2。再生リスト自身のタイトルは対象外）
      if (kw && !p.gameName.toLowerCase().includes(kw) && !p.channelName.toLowerCase().includes(kw)) return false;
      if (selectedTagIds.size > 0) {
        const tagIdSet = new Set(p.tags.map((t) => t.id));
        for (const tagId of selectedTagIds) {
          if (!tagIdSet.has(tagId)) return false;
        }
      }
      return true;
    });
  }, [playlists, keyword, selectedTagIds]);

  const sorted = useMemo(() => sortPlaylists(filtered, sort), [filtered, sort]);

  // 検索条件・ソートが変わったらページを1に戻す。「propが変わったらstateを調整する」パターンは
  // 描画中に直接setStateする（React公式の推奨。effect内でのsetStateは1テンポ余分な再描画を招く）
  const filterKey = `${keyword}|${[...selectedTagIds].sort().join(',')}|${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
      {tags
        .filter((t) => selectedTagIds.has(t.id))
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
      <SectionHeading className="mb-5">再生リストを探す</SectionHeading>

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
            <span className="text-md text-text-muted">{sorted.length}件</span>
            <SelectMenu value={sort} onValueChange={setSort} options={SORT_OPTIONS} prefix="ソート:" aria-label="並び替え" />
          </div>

          {playlists === null ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} flush>
                  <Skeleton className="aspect-video w-full rounded-none" />
                  <SkeletonText lines={2} className="p-3" />
                </Card>
              ))}
            </div>
          ) : playlists.length === 0 ? (
            <EmptyState
              icon={<InventoryIcon />}
              title="まだ再生リストが登録されていません"
              description="管理者が再生リストを登録すると、ここに表示されます"
            />
          ) : sorted.length === 0 ? (
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
          ) : (
            <>
              <PlaylistCardGrid playlists={pageItems} highlightTagIds={selectedTagIds} />
              <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
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
