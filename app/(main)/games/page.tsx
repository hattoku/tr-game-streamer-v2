/**
 * 「ゲームタイトルから探す」（/games）。ページ ゲームタイトル 探す 仕様書 準拠。
 * カタログ規模が小さい前提で、全件クライアント取得＋クライアント側フィルタ・ソート・
 * ページングで実装する（`/playlists/new`のゲーム選択と同じ簡易実装方針。フェーズ3時点では
 * 全文検索インフラは持たない）。
 *
 * スコープ外・簡略化した点:
 * - タグ絞り込みのカテゴリ分け（§4.4「遊び方系・IP系などのカテゴリごとに上位5件」）は、
 *   `tags`スキーマにカテゴリを表す情報が無いため未実装。フラットな一覧として全件表示する。
 * - キーワード検索の「デバウンス300ms」はクライアント内メモリ配列のフィルタのため実施しない
 *   （デバウンスしてもしなくても体感差が無い規模のため）。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { fetchTagsMap, resolveTags, type TagInfo } from '@/lib/tags';
import { fetchGameVideoCounts } from '@/lib/playlist-aggregates';
import { GameCard, type GameCardData } from '@/components/games/GameCard';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { SelectMenu } from '@/components/ui/DropdownMenu';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, InventoryIcon, SearchIcon, XIcon } from '@/components/ui/icons';

const PAGE_SIZE = 20;

type SortKey = 'playlistCount' | 'title' | 'videoCount';
const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'playlistCount', label: '再生リスト登録数順' },
  { value: 'title', label: 'タイトル名順' },
  { value: 'videoCount', label: '動画数順' },
];

interface Genre {
  id: string;
  name: string;
}

interface GameListItem extends GameCardData {
  genreId: string | null;
}

export default function GamesPage() {
  const searchParams = useSearchParams();

  const [games, setGames] = useState<GameListItem[] | null>(null);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [tags, setTags] = useState<TagInfo[]>([]);

  const [keyword, setKeyword] = useState('');
  const [selectedGenreIds, setSelectedGenreIds] = useState<Set<string>>(new Set());
  // URLの ?tag= からの絞り込み流入（ゲームタイトル詳細ページのタグクリック等）。
  // searchParamsは初回描画時から同期的に取得できるため、遅延初期化で対応する
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(() => {
    const tagId = searchParams.get('tag');
    return tagId ? new Set([tagId]) : new Set();
  });
  const [showAllTags, setShowAllTags] = useState(false);
  const [sort, setSort] = useState<SortKey>('playlistCount');
  const [page, setPage] = useState(1);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'games')),
      getDocs(collection(db, 'genres')),
      fetchTagsMap(),
      fetchGameVideoCounts(),
    ]).then(([gamesSnap, genresSnap, tagsMap, videoCounts]) => {
      setGenres(
        genresSnap.docs
          .map((d) => ({ id: d.id, name: (d.data().name as string) ?? '' }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
      );
      setTags(
        [...tagsMap.values()].filter((t) => t.usageGameCount > 0).sort((a, b) => a.name.localeCompare(b.name, 'ja')),
      );
      setGames(
        gamesSnap.docs.map((d) => {
          const data = d.data();
          const gameTagIds: string[] = data.gameTagIds ?? [];
          const gameTagsFixed: string[] = data.gameTagsFixed ?? [];
          return {
            id: d.id,
            title: data.title ?? '',
            packageImageUrl: data.packageImageUrl ?? null,
            genreId: data.genreId ?? null,
            genreName: data.genreName ?? '',
            playlistCount: data.playlistCount ?? 0,
            videoCount: videoCounts.get(d.id) ?? 0,
            tags: resolveTags(gameTagIds, gameTagsFixed, tagsMap),
          } satisfies GameListItem;
        }),
      );
    });
  }, []);

  const filtered = useMemo(() => {
    if (!games) return [];
    const kw = keyword.trim().toLowerCase();
    return games.filter((g) => {
      if (kw && !g.title.toLowerCase().includes(kw)) return false;
      if (selectedGenreIds.size > 0 && !selectedGenreIds.has(g.genreId ?? '')) {
        return false;
      }
      if (selectedTagIds.size > 0) {
        const gameTagIdSet = new Set(g.tags.map((t) => t.id));
        for (const tagId of selectedTagIds) {
          if (!gameTagIdSet.has(tagId)) return false;
        }
      }
      return true;
    });
  }, [games, keyword, selectedGenreIds, selectedTagIds]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title, 'ja');
      const diff = sort === 'videoCount' ? b.videoCount - a.videoCount : b.playlistCount - a.playlistCount;
      return diff !== 0 ? diff : a.title.localeCompare(b.title, 'ja');
    });
    return list;
  }, [filtered, sort]);

  // 検索条件・ソートが変わったらページを1に戻す。「propが変わったらstateを調整する」パターンは
  // 描画中に直接setStateする（React公式の推奨。effect内でのsetStateは1テンポ余分な再描画を招く）
  const filterKey = `${keyword}|${[...selectedGenreIds].sort().join(',')}|${[...selectedTagIds].sort().join(',')}|${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeFilterCount = (keyword.trim() ? 1 : 0) + selectedGenreIds.size + selectedTagIds.size;
  const visibleTags = showAllTags ? tags : tags.slice(0, 20);

  function toggleGenre(id: string) {
    setSelectedGenreIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
    setSelectedGenreIds(new Set());
    setSelectedTagIds(new Set());
  }

  const activeFilterChips = activeFilterCount > 0 && (
    <div className="flex flex-wrap gap-2">
      {keyword.trim() && <FilterChip label={keyword.trim()} onRemove={() => setKeyword('')} />}
      {genres
        .filter((g) => selectedGenreIds.has(g.id))
        .map((g) => (
          <FilterChip key={g.id} label={g.name} onRemove={() => toggleGenre(g.id)} />
        ))}
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
          placeholder="ゲームタイトル名で検索"
          aria-label="ゲームタイトル名で検索"
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

      {genres.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-md text-text-tertiary">ゲームジャンルで絞り込む</p>
          <div className="flex flex-wrap gap-2">
            {genres.map((g) => (
              <FilterToggle key={g.id} label={g.name} selected={selectedGenreIds.has(g.id)} onClick={() => toggleGenre(g.id)} />
            ))}
          </div>
        </div>
      )}

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
      <SectionHeading className="mb-5">ゲームタイトルから探す</SectionHeading>

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

          {games === null ? (
            <div className="grid grid-cols-1 gap-3" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="aspect-[3/4] w-[88px] shrink-0 rounded-[8px]" />
                  <SkeletonText lines={3} className="flex-1" />
                </div>
              ))}
            </div>
          ) : games.length === 0 ? (
            <EmptyState icon={<InventoryIcon />} title="まだゲームタイトルが登録されていません" />
          ) : sorted.length === 0 ? (
            <EmptyState
              icon={<SearchIcon />}
              title="該当するゲームタイトルが見つかりませんでした"
              description="検索条件を変えてお試しください"
              action={
                <Button variant="secondary" onClick={resetFilters}>
                  検索条件をリセット
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {pageItems.map((g) => (
                  <GameCard key={g.id} game={g} highlightTagIds={selectedTagIds} />
                ))}
              </div>
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
 * ジャンル・タグ絞り込みバッジ（§4.3・§4.4「選択済みの表示: ハイライトで選択状態を明示」）。
 * Tagコンポーネントの淡いハイライトでは選択有無が分かりにくいという指摘（2026-09-14）を受け、
 * トグルボタン（境界線色＋塗りつぶし＋チェックアイコン）で明示する
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
