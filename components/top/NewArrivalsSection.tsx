/**
 * TOPページ 新着の再生リストセクション（ログイン済み時のみ、ページ top 仕様書 §7）。
 * プレミテへの登録日（`playlists.registeredAt`）が新しい順。「再生リストを探す」ページの「新着順」ソート
 * （`latestVideoPublishedAt`基準）とは基準が異なるため、`sortPlaylists`は使わずここで直接ソートする
 * （§7.3実装注記）。対象が0件ならセクション自体を出さない。
 */
'use client';

import { useMemo } from 'react';
import { PlaylistCard, type PlaylistSummary } from '@/components/playlists/PlaylistGrid';
import { CarouselItem } from '@/components/ui/Carousel';
import { TopSection } from '@/components/top/TopSection';

export function NewArrivalsSection({ playlists }: { playlists: PlaylistSummary[] }) {
  const sorted = useMemo(() => [...playlists].sort((a, b) => b.registeredAt - a.registeredAt), [playlists]);

  if (sorted.length === 0) return null;

  return (
    <TopSection title="新着の再生リスト" viewAllHref="/playlists?sort=newest">
      {sorted.map((p) => (
        <CarouselItem key={p.id}>
          <PlaylistCard playlist={p} className="block h-full" />
        </CarouselItem>
      ))}
    </TopSection>
  );
}
