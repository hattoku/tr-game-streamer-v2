/**
 * TOPページ タグピックアップセクション（ページ top 仕様書 §8）。未ログイン・ログイン済み問わず表示。
 * `tags.usagePlaylistCount`降順の上位6件（0件のタグは対象外、§8.2実装注記）について、
 * タグごとに「# [タグ名] の再生リスト」セクションをスコア高い順（スコアなしは末尾）で並べる。
 */
'use client';

import { useMemo } from 'react';
import { PlaylistCard, sortPlaylists, type PlaylistSummary } from '@/components/playlists/PlaylistGrid';
import { CarouselItem } from '@/components/ui/Carousel';
import { TopSection } from '@/components/top/TopSection';
import type { TagInfo } from '@/lib/tags';

export function TagPickupSections({ playlists, tags }: { playlists: PlaylistSummary[]; tags: Map<string, TagInfo> }) {
  const topTags = useMemo(
    () =>
      [...tags.values()]
        .filter((t) => t.usagePlaylistCount > 0)
        .sort((a, b) => b.usagePlaylistCount - a.usagePlaylistCount)
        .slice(0, 6),
    [tags],
  );

  return (
    <>
      {topTags.map((tag) => {
        const matched = sortPlaylists(
          playlists.filter((p) => p.tags.some((t) => t.id === tag.id)),
          'score',
        );
        if (matched.length === 0) return null;
        return (
          <TopSection key={tag.id} title={`# ${tag.name} の再生リスト`} viewAllHref={`/playlists?tag=${tag.id}`}>
            {matched.map((p) => (
              <CarouselItem key={p.id}>
                <PlaylistCard playlist={p} className="block h-full" />
              </CarouselItem>
            ))}
          </TopSection>
        );
      })}
    </>
  );
}
