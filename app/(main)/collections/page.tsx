/**
 * 「まとめを探す」（/collections）。ページ 再生リスト まとめ機能仕様書 §6。
 * `/channels`・`/games` と同じ簡易実装方針: 公開まとめ全件と公開再生リスト（カードのサムネイル用）を
 * クライアントで取得し、キーワード絞り込み・20件ページングもクライアント側で行う。
 *
 * 仕様からの差分（2026-10-12 ユーザー決定、まとめ機能仕様書 §1）:
 * - 並び順は新着順（既定）と保存数順（§6.2）。保存数順は保存機能（サブステップ4-3）で追加。同数は新着順。
 * - カードは PC 2列・スマホ 1列のグリッド（サムネイル3枚と説明文があり3列以上だと窮屈なため）。
 * - ログイン中は見出し横に「自分のまとめ」「保存したまとめ」「新しいまとめを作る」を置く（ユーザーメニュー以外の入口）。
 * - キーワード検索のデバウンスはクライアント内メモリ配列のフィルタのため行わない（`/channels` と同じ）。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchPublicPlaylists } from '@/components/playlists/PlaylistGrid';
import { CollectionCard } from '@/components/collections/CollectionCard';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card, SectionHeading } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { SkeletonText } from '@/components/ui/Skeleton';
import { SelectMenu } from '@/components/ui/DropdownMenu';
import { AlertIcon, InventoryIcon, PlusIcon, SearchIcon, XIcon } from '@/components/ui/icons';
import { collectionThumbnails, fetchPublicCollections, type CollectionData } from '@/lib/collections';

const PAGE_SIZE = 20;

type SortKey = 'newest' | 'saved';
const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'newest', label: '新着順' },
  { value: 'saved', label: '保存数順' },
];

export default function CollectionsPage() {
  const { user } = useAuth();
  const [collections, setCollections] = useState<CollectionData[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [thumbnailById, setThumbnailById] = useState<Map<string, string>>(new Map());
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchPublicCollections()
      .then(setCollections)
      .catch(() => setLoadError(true));
    // サムネイルは取れなくてもカードは出す（空のサムネイル枠のまま）
    fetchPublicPlaylists()
      .then((list) => setThumbnailById(new Map(list.map((p) => [p.id, p.thumbnailUrl]))))
      .catch(() => {});
  }, []);

  // キーワードはタイトル・説明文の部分一致（§6.2）
  const filtered = useMemo(() => {
    if (!collections) return [];
    const kw = keyword.trim().toLowerCase();
    if (!kw) return collections;
    return collections.filter((c) => c.title.toLowerCase().includes(kw) || (c.description ?? '').toLowerCase().includes(kw));
  }, [collections, keyword]);

  // 取得時点で新着順のため、保存数順は安定ソートで同数の新着順を保つ
  const sorted = useMemo(() => (sort === 'saved' ? [...filtered].sort((a, b) => b.savedCount - a.savedCount) : filtered), [filtered, sort]);

  // 検索条件が変わったらページを1に戻す（`/channels` と同じ「描画中に直接setState」パターン）
  const filterKey = `${keyword}|${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading>まとめを探す</SectionHeading>
        {user && (
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href="/collections/mine" variant="secondary" size="sm">
              自分のまとめ
            </LinkButton>
            <LinkButton href="/collections/saved" variant="secondary" size="sm">
              保存したまとめ
            </LinkButton>
            <LinkButton href="/collections/new" variant="secondary" size="sm">
              <PlusIcon size={13} />
              新しいまとめを作る
            </LinkButton>
          </div>
        )}
      </div>

      <div className="relative md:max-w-[480px]">
        <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input
          type="text"
          placeholder="タイトル・説明文で検索"
          aria-label="まとめをタイトル・説明文で検索"
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

      {loadError ? (
        <EmptyState
          icon={<AlertIcon />}
          title="まとめを読み込めませんでした"
          description="通信状況を確認して、ページを再読み込みしてください"
          action={
            <Button variant="secondary" onClick={() => window.location.reload()}>
              再読み込み
            </Button>
          }
        />
      ) : collections === null ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <SkeletonText lines={4} />
            </Card>
          ))}
        </div>
      ) : collections.length === 0 ? (
        <EmptyState
          icon={<InventoryIcon />}
          title="まだ公開されているまとめがありません"
          description="お気に入りの再生リストを集めて、最初のまとめを公開してみませんか？"
          action={
            user ? (
              <LinkButton href="/collections/new" variant="primary">
                <PlusIcon size={14} />
                新しいまとめを作る
              </LinkButton>
            ) : undefined
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<SearchIcon />}
          title="該当するまとめが見つかりませんでした"
          description="検索条件を変えてお試しください"
          action={
            <Button variant="secondary" onClick={() => setKeyword('')}>
              検索条件をリセット
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-md text-text-muted">{filtered.length}件</span>
            <SelectMenu value={sort} onValueChange={setSort} options={SORT_OPTIONS} prefix="ソート:" aria-label="並び替え" />
          </div>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {pageItems.map((c) => (
              <li key={c.id} className="min-w-0">
                <CollectionCard collection={c} thumbnails={collectionThumbnails(c, thumbnailById)} className="h-full" />
              </li>
            ))}
          </ul>
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
