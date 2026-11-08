/**
 * TOPページ タグピックアップセクション（ページ top 仕様書 §8）。未ログイン・ログイン済み問わず表示。
 * `tags.usagePlaylistCount`降順の上位6件（0件のタグ・使用数3件未満のユーザー作成タグは対象外、§8.2実装注記）について、
 * タグごとに「# [タグ名] の再生リスト」セクションをスコア高い順（スコアなしは末尾）に最大20件並べる。
 * タグの選定・並べ替え・件数の絞り込みはサーバー側（共通 一覧のサーバー側検索 仕様書 §3.4）。
 */
'use client';

import { PlaylistCard } from '@/components/playlists/PlaylistGrid';
import { CarouselItem } from '@/components/ui/Carousel';
import { TopSection } from '@/components/top/TopSection';
import type { PlaylistSummary } from '@/lib/catalog-shared';

export function TagPickupSections({ pickups }: { pickups: Array<{ tagId: string; tagName: string; playlists: PlaylistSummary[] }> }) {
  return (
    <>
      {pickups.map((tag) => {
        if (tag.playlists.length === 0) return null;
        return (
          <TopSection key={tag.tagId} title={`# ${tag.tagName} の再生リスト`} viewAllHref={`/playlists?tag=${tag.tagId}`}>
            {tag.playlists.map((p) => (
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
