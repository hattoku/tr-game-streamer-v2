/**
 * TOPページ本実装（ページ top 仕様書。フェーズ6ステップ2）。
 * 未ログイン: ヒーロー（§4）→ 注目の再生リスト（§6）→ 新着のまとめ → タグピックアップ（§8）
 * ログイン済み: マイリスト（§5）→ 注目の再生リスト（§6）→ 新着の再生リスト（§7）→ 新着のまとめ → タグピックアップ（§8）
 * 新着のまとめ（2026-10-12、まとめ機能仕様書 §7）は公開まとめを別途取得し、取得前・0件・失敗時は出さない（他セクションの表示は待たせない）。
 * 公開再生リスト全件（`fetchPublicPlaylists`）＋タグマスタ＋ジャンルマスタを1回だけ取得し、
 * 各セクション（`components/top/`）へ配列で渡して表示専用にする。マイリストセクションのみ
 * ログイン後に別途取得する（`useMylistEntries`、`components/top/MylistSection.tsx`内部）。
 * マイリストの取得は公開再生リスト等の取得完了を待たず、認証確定時点で並行して開始する
 * （読み込み中の時間が長いほどタブ切替等で通信が止まる事象に巻き込まれやすいため）。
 * ログイン済みは注目の再生リストから完走済みを除くため（§6.4）、完走済みの再生リストIDも並行して取得し、
 * 取得するまで注目セクションの位置はスケルトンにする（失敗・タイムアウト時は除外なしで表示）。
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
import { NewCollectionsSection } from '@/components/top/NewCollectionsSection';
import { fetchPublicCollections, type CollectionData } from '@/lib/collections';
import { fetchCompletedPlaylistIds } from '@/lib/mylist-entries';
import { Skeleton } from '@/components/ui/Skeleton';

interface Genre {
  id: string;
  name: string;
}

/** 完走済みIDの取得がこれを超えたら除外なしで注目セクションを出す（取得はその後も待ち、届いたら反映する） */
const COMPLETED_TIMEOUT_MS = 15_000;
const NO_EXCLUDES = new Set<string>();

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [tags, setTags] = useState<Map<string, TagInfo> | null>(null);
  const [genres, setGenres] = useState<Genre[] | null>(null);
  const [collections, setCollections] = useState<CollectionData[]>([]);
  const [completed, setCompleted] = useState<{ uid: string; ids: Set<string> } | null>(null);
  const uid = user?.uid ?? null;

  useEffect(() => {
    Promise.all([fetchPublicPlaylists(), fetchTagsMap(), getDocs(collection(db, 'genres'))]).then(
      ([playlistList, tagsMap, genresSnap]) => {
        setPlaylists(playlistList);
        setTags(tagsMap);
        setGenres(genresSnap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? '' })));
      },
    );
    fetchPublicCollections()
      .then(setCollections)
      .catch(() => setCollections([]));
  }, []);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const fallback = () => {
      if (active) setCompleted((c) => (c?.uid === uid ? c : { uid, ids: new Set() }));
    };
    const timer = setTimeout(fallback, COMPLETED_TIMEOUT_MS);
    fetchCompletedPlaylistIds(uid).then((ids) => {
      if (active) setCompleted({ uid, ids });
    }, fallback);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [uid]);
  // 未ログインは除外なし。ログイン済みは当該ユーザーの完走済みIDが揃うまで注目セクションを待たせる
  const completedIds = uid ? (completed?.uid === uid ? completed.ids : null) : NO_EXCLUDES;

  const dataReady = playlists !== null && tags !== null && genres !== null;
  if (authLoading || (!user && !dataReady)) {
    return <TopSkeleton />;
  }

  // ログイン済みはマイリストセクションを先に出し、公開再生リスト等の取得を待つ間は残りをスケルトンにする
  // （MylistSectionが同じ位置にマウントされ続け、取得完了時に再取得が走らないよう子の並びを固定している）
  return (
    <div className="flex flex-col gap-10">
      {!user && <HeroSection />}
      {user && <MylistSection />}
      {dataReady ? (
        <>
          {completedIds ? (
            <FeaturedSection playlists={playlists} genres={genres} excludePlaylistIds={completedIds} />
          ) : (
            <SectionSkeleton />
          )}
          {user && <NewArrivalsSection playlists={playlists} />}
          <NewCollectionsSection collections={collections} playlists={playlists} />
          <TagPickupSections playlists={playlists} tags={tags} />
        </>
      ) : (
        <SectionSkeleton />
      )}
    </div>
  );
}

function TopSkeleton() {
  return (
    <div className="flex flex-col gap-10" aria-busy="true" aria-label="読み込み中">
      <Skeleton className="h-[140px] w-full rounded-[12px]" />
      <SectionSkeleton />
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-6 w-[180px]" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-video w-[240px] shrink-0 rounded-[12px] md:w-[280px]" />
        ))}
      </div>
    </div>
  );
}
