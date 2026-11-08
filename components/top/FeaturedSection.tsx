/**
 * TOPページ 注目の再生リストセクション（ページ top 仕様書 §6）。未ログイン・ログイン済み問わず表示。
 * ジャンルタブ（総合＋対象があるジャンルのみ、§6.3実装注記）で絞り込み、加重平均スコアの高い順に
 * カルーセル表示する。スコアなし（レビュー0件）は対象外。
 * サーバーが「総合」とジャンルごとにスコア上位を最大40件ずつ返し（共通 一覧のサーバー側検索 仕様書 §3.4）、ここで
 * ログイン中のユーザーが完走済みの再生リスト（`excludePlaylistIds`、§6.4）を除いてから最大20件を出す
 * （除いた分の補充はしない）。対象が1件も無ければセクション自体を出さない。
 * タブは`/mylist`のフィルタタブ（app/(main)/mylist/page.tsx）と同じく、Radix Tabsを絞り込みUIとしてのみ
 * 使い（TabsContentは使わず、選択状態に応じてこのコンポーネント側でカード配列を切り替える）。
 */
'use client';

import { useMemo, useState } from 'react';
import { PlaylistCard } from '@/components/playlists/PlaylistGrid';
import { CarouselItem } from '@/components/ui/Carousel';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { TopSection } from '@/components/top/TopSection';
import { TOP_CAROUSEL_LIMIT, type PlaylistSummary } from '@/lib/catalog-shared';

interface Genre {
  id: string;
  name: string;
}

const OVERALL = '__overall__';

export function FeaturedSection({
  overall,
  byGenre,
  genres,
  excludePlaylistIds,
}: {
  /** スコアの高い順（サーバーで並べ替え済み） */
  overall: PlaylistSummary[];
  /** ジャンルID → そのジャンルのスコアの高い順 */
  byGenre: Record<string, PlaylistSummary[]>;
  genres: Genre[];
  /** 表示しない再生リストID（ログイン中のユーザーが完走済みのもの、§6.4） */
  excludePlaylistIds: Set<string>;
}) {
  const visible = useMemo(() => {
    const pick = (list: PlaylistSummary[]) => list.filter((p) => !excludePlaylistIds.has(p.id)).slice(0, TOP_CAROUSEL_LIMIT);
    return {
      overall: pick(overall),
      byGenre: new Map(Object.entries(byGenre).map(([id, list]) => [id, pick(list)])),
    };
  }, [overall, byGenre, excludePlaylistIds]);

  // 対象（完走済みを除いたスコア付き再生リスト）が1件以上あるジャンルのみタブとして出す（§6.3実装注記）
  const availableGenres = useMemo(
    () => genres.filter((g) => (visible.byGenre.get(g.id)?.length ?? 0) > 0).sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [visible, genres],
  );

  const [genreId, setGenreId] = useState<string>(OVERALL);

  // 除外対象が後から届いてタブが消えた場合は「総合」に戻す
  const activeGenreId = availableGenres.some((g) => g.id === genreId) ? genreId : OVERALL;
  const filtered = activeGenreId === OVERALL ? visible.overall : (visible.byGenre.get(activeGenreId) ?? []);

  if (visible.overall.length === 0) return null;

  return (
    <TopSection
      title="注目の再生リスト"
      viewAllHref="/playlists"
      extra={
        availableGenres.length > 0 && (
          <Tabs value={activeGenreId} onValueChange={setGenreId}>
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
