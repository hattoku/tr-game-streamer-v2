/**
 * TOPページ本実装（ページ top 仕様書。フェーズ6ステップ2）。
 * 未ログイン: ヒーロー（§4）→ 注目の再生リスト（§6）→ タグピックアップ（§8）
 * ログイン済み: マイリスト（§5）→ 注目の再生リスト（§6）→ 新着の再生リスト（§7）→ タグピックアップ（§8）
 * 公開再生リスト全件（`fetchPublicPlaylists`）＋タグマスタ＋ジャンルマスタを1回だけ取得し、
 * 各セクション（`components/top/`）へ配列で渡して表示専用にする。マイリストセクションのみ
 * ログイン後に別途取得する（`fetchMylistEntries`、`components/top/MylistSection.tsx`内部）。
 */
'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchPublicPlaylists, type PlaylistSummary } from '@/components/playlists/PlaylistGrid';
import { fetchTagsMap, type TagInfo } from '@/lib/tags';
import { HeroSection } from '@/components/top/HeroSection';
import { MylistSection } from '@/components/top/MylistSection';
import { FeaturedSection } from '@/components/top/FeaturedSection';
import { NewArrivalsSection } from '@/components/top/NewArrivalsSection';
import { TagPickupSections } from '@/components/top/TagPickupSections';
import { Skeleton } from '@/components/ui/Skeleton';

interface Genre {
  id: string;
  name: string;
}

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [tags, setTags] = useState<Map<string, TagInfo> | null>(null);
  const [genres, setGenres] = useState<Genre[] | null>(null);

  useEffect(() => {
    Promise.all([fetchPublicPlaylists(), fetchTagsMap(), getDocs(collection(db, 'genres'))]).then(
      ([playlistList, tagsMap, genresSnap]) => {
        setPlaylists(playlistList);
        setTags(tagsMap);
        setGenres(genresSnap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? '' })));
      },
    );
  }, []);

  if (authLoading || playlists === null || tags === null || genres === null) {
    return <TopSkeleton />;
  }

  return (
    <div className="flex flex-col gap-10">
      {!user && <HeroSection />}
      {user && <MylistSection />}
      <FeaturedSection playlists={playlists} genres={genres} />
      {user && <NewArrivalsSection playlists={playlists} />}
      <TagPickupSections playlists={playlists} tags={tags} />
    </div>
  );
}

function TopSkeleton() {
  return (
    <div className="flex flex-col gap-10" aria-busy="true" aria-label="読み込み中">
      <Skeleton className="h-[140px] w-full rounded-[12px]" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-[180px]" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video w-[240px] shrink-0 rounded-[12px] md:w-[280px]" />
          ))}
        </div>
      </div>
    </div>
  );
}
