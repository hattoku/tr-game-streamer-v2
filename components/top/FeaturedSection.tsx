/**
 * TOPページ 注目の再生リストセクション（ページ top 仕様書 §6）。未ログイン・ログイン済み問わず表示。
 * ジャンルタブ（総合＋対象があるジャンルのみ、§6.3実装注記）で絞り込み、加重平均スコアの高い順に
 * カルーセル表示する。スコアなし（レビュー0件）は対象外。対象が1件も無ければセクション自体を出さない。
 * タブは`/mylist`のフィルタタブ（app/(main)/mylist/page.tsx）と同じく、Radix Tabsを絞り込みUIとしてのみ
 * 使い（TabsContentは使わず、選択状態に応じてこのコンポーネント側でカード配列をフィルタする）。
 */
'use client';

import { useMemo, useState } from 'react';
import { PlaylistCard, sortPlaylists, type PlaylistSummary } from '@/components/playlists/PlaylistGrid';
import { CarouselItem } from '@/components/ui/Carousel';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { TopSection } from '@/components/top/TopSection';

interface Genre {
  id: string;
  name: string;
}

const OVERALL = '__overall__';

export function FeaturedSection({ playlists, genres }: { playlists: PlaylistSummary[]; genres: Genre[] }) {
  const scored = useMemo(() => sortPlaylists(playlists.filter((p) => p.score != null), 'score'), [playlists]);

  // 対象（スコア付き再生リスト）が1件以上あるジャンルのみタブとして出す（§6.3実装注記）
  const availableGenres = useMemo(() => {
    const idsWithScore = new Set<string>();
    scored.forEach((p) => p.gameGenreIds.forEach((id) => idsWithScore.add(id)));
    return genres.filter((g) => idsWithScore.has(g.id)).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [scored, genres]);

  const [genreId, setGenreId] = useState<string>(OVERALL);

  const filtered = useMemo(() => {
    if (genreId === OVERALL) return scored;
    return scored.filter((p) => p.gameGenreIds.includes(genreId));
  }, [scored, genreId]);

  if (scored.length === 0) return null;

  return (
    <TopSection
      title="注目の再生リスト"
      viewAllHref="/playlists"
      extra={
        availableGenres.length > 0 && (
          <Tabs value={genreId} onValueChange={setGenreId}>
            <TabsList aria-label="ジャンルで絞り込み" scrollable>
              <TabsTrigger value={OVERALL}>総合</TabsTrigger>
              {availableGenres.map((g) => (
                <TabsTrigger key={g.id} value={g.id}>
                  {g.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )
      }
    >
      {filtered.map((p) => (
        <CarouselItem key={p.id}>
          <PlaylistCard playlist={p} className="block h-full" />
        </CarouselItem>
      ))}
    </TopSection>
  );
}
