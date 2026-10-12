/**
 * TOPページ 新着のまとめセクション（まとめ機能仕様書 §7 発見導線）。
 * 公開まとめを新着順に最大10件、他のセクションと同じカルーセルで並べる。対象が0件ならセクション自体を出さない。
 * カードのサムネイルは TOP が取得済みの公開再生リストから引く（追加の読み取りをしない）。
 * 定義は TOP仕様書 §7.5、決定の経緯はまとめ機能仕様書 §1（2026-10-12）。
 * 「保存数の多いまとめ」（§7）は保存機能（サブステップ4-3）の実装時に検討する。
 */
'use client';

import { useMemo } from 'react';
import type { PlaylistSummary } from '@/components/playlists/PlaylistGrid';
import { CollectionCard } from '@/components/collections/CollectionCard';
import { CarouselItem } from '@/components/ui/Carousel';
import { TopSection } from '@/components/top/TopSection';
import { collectionThumbnails, type CollectionData } from '@/lib/collections';

const MAX_ITEMS = 10;

export function NewCollectionsSection({ collections, playlists }: { collections: CollectionData[]; playlists: PlaylistSummary[] }) {
  const thumbnailById = useMemo(() => new Map(playlists.map((p) => [p.id, p.thumbnailUrl])), [playlists]);

  if (collections.length === 0) return null;

  return (
    <TopSection title="新着のまとめ" viewAllHref="/collections">
      {collections.slice(0, MAX_ITEMS).map((c) => (
        // まとめカードはサムネイル3枚＋説明文を持つため再生リストカードより広くする
        <CarouselItem key={c.id} className="w-[300px] md:w-[360px]">
          <CollectionCard collection={c} thumbnails={collectionThumbnails(c, thumbnailById)} className="h-full" />
        </CarouselItem>
      ))}
    </TopSection>
  );
}
