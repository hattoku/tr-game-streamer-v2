/**
 * TOPページ 新着の再生リストセクション（ログイン済み時のみ、ページ top 仕様書 §7）。
 * プレミテへの登録日（`playlists.registeredAt`）が新しい順に最大20件。並べ替えと件数の絞り込みはサーバー側
 * （共通 一覧のサーバー側検索 仕様書 §3.4）。「再生リストを探す」ページの「新着順」ソート（`latestVideoPublishedAt`基準）
 * とは基準が異なる（§7.3実装注記）。対象が0件ならセクション自体を出さない。
 */
'use client';

import { PlaylistCard } from '@/components/playlists/PlaylistGrid';
import { CarouselItem } from '@/components/ui/Carousel';
import { TopSection } from '@/components/top/TopSection';
import type { PlaylistSummary } from '@/lib/catalog-shared';

export function NewArrivalsSection({ playlists }: { playlists: PlaylistSummary[] }) {
  if (playlists.length === 0) return null;

  return (
    <TopSection title="新着の再生リスト" viewAllHref="/playlists?sort=newest">
      {playlists.map((p) => (
        <CarouselItem key={p.id}>
          <PlaylistCard playlist={p} className="block h-full" />
        </CarouselItem>
      ))}
    </TopSection>
  );
}
