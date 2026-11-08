/**
 * TOPページ本実装（ページ top 仕様書。フェーズ6ステップ2）。
 * 未ログイン: ヒーロー（§4）→ 人気のチャンネル（§6A）→ 注目の再生リスト（§6）→ 新着のまとめ → タグピックアップ（§8）
 * ログイン済み: マイリスト（§5）→ 人気のチャンネル（§6A）→ 注目の再生リスト（§6）→ 新着の再生リスト（§7）→ 新着のまとめ → タグピックアップ（§8）
 * 人気のチャンネル（リブランディング段階5）は再生リストのセクションと同じ応答（`fetchTopCatalog` の `popularChannels`）で受け取る。
 * 新着のまとめ（2026-10-12、まとめ機能仕様書 §7）は公開まとめを別途取得し、取得前・0件・失敗時は出さない（他セクションの表示は待たせない）。
 * まとめ機能の取り下げ（2026-11-01、TOP仕様書 v2.0 §7.5）で COLLECTIONS_ENABLED が false の間は取得も表示もしない。
 * 各セクションの再生リスト（注目・新着・タグピックアップ）はサーバー側で選んだ分だけ受け取る（`fetchTopCatalog`、
 * リブランディング段階7・共通 一覧のサーバー側検索 仕様書 §3.4。各カルーセル最大20件）。ジャンルマスタと合わせて1回だけ取得し、
 * 各セクション（`components/top/`）へ渡して表示専用にする。マイリストセクションのみ
 * ログイン後に別途取得する（`useMylistEntries`、`components/top/MylistSection.tsx`内部）。
 * マイリストの取得は公開再生リスト等の取得完了を待たず、認証確定時点で並行して開始する
 * （読み込み中の時間が長いほどタブ切替等で通信が止まる事象に巻き込まれやすいため）。
 * ログイン済みは注目の再生リストから完走済みを除くため（§6.4）、完走済みの再生リストIDも並行して取得し、
 * 取得するまで注目セクションの位置はスケルトンにする（失敗・タイムアウト時は除外なしで表示）。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchTopCatalog } from '@/lib/catalog';
import type { PlaylistSummary, TopCatalog } from '@/lib/catalog-shared';
import { HeroSection } from '@/components/top/HeroSection';
import { MylistSection } from '@/components/top/MylistSection';
import { FeaturedSection } from '@/components/top/FeaturedSection';
import { NewArrivalsSection } from '@/components/top/NewArrivalsSection';
import { PopularChannelsSection } from '@/components/top/PopularChannelsSection';
import { TagPickupSections } from '@/components/top/TagPickupSections';
import { NewCollectionsSection } from '@/components/top/NewCollectionsSection';
import { fetchPublicCollections, type CollectionData } from '@/lib/collections';
import { COLLECTIONS_ENABLED } from '@/lib/feature-flags';
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
  const [top, setTop] = useState<TopCatalog | null>(null);
  const [genres, setGenres] = useState<Genre[] | null>(null);
  const [collections, setCollections] = useState<CollectionData[]>([]);
  const [completed, setCompleted] = useState<{ uid: string; ids: Set<string> } | null>(null);
  const uid = user?.uid ?? null;

  useEffect(() => {
    // 失敗したときは再生リストのセクションを出さない（空として扱う。ヒーロー・マイリストは表示する）
    fetchTopCatalog()
      .catch((): TopCatalog => ({ playlists: [], featured: { overall: [], byGenre: {} }, newArrivals: [], tagPickups: [], popularChannels: [] }))
      .then(setTop);
    getDocs(collection(db, 'genres'))
      .then((genresSnap) => genresSnap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? '' })))
      .catch(() => [])
      .then(setGenres);
    if (COLLECTIONS_ENABLED) {
      fetchPublicCollections()
        .then(setCollections)
        .catch(() => setCollections([]));
    }
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

  // 各セクションは ID の並びで届くので、カードの中身（top.playlists）を引いて並べる
  const sections = useMemo(() => {
    if (!top) return null;
    const byId = new Map<string, PlaylistSummary>(top.playlists.map((p) => [p.id, p]));
    const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((p): p is PlaylistSummary => !!p);
    return {
      featuredOverall: pick(top.featured.overall),
      featuredByGenre: Object.fromEntries(Object.entries(top.featured.byGenre).map(([id, ids]) => [id, pick(ids)])),
      newArrivals: pick(top.newArrivals),
      tagPickups: top.tagPickups.map((t) => ({ tagId: t.tagId, tagName: t.tagName, playlists: pick(t.ids) })),
      popularChannels: top.popularChannels ?? [],
      all: top.playlists,
    };
  }, [top]);
  const dataReady = sections !== null && genres !== null;
  if (authLoading || (!user && !dataReady)) {
    return <TopSkeleton />;
  }

  // ログイン済みはマイリストセクションを先に出し、公開再生リスト等の取得を待つ間は残りをスケルトンにする
  // （MylistSectionが同じ位置にマウントされ続け、取得完了時に再取得が走らないよう子の並びを固定している）
  return (
    <div className="flex flex-col gap-10">
      {!user && <HeroSection />}
      {user && <MylistSection />}
      {sections && genres ? (
        <>
          <PopularChannelsSection channels={sections.popularChannels} />
          {completedIds ? (
            <FeaturedSection
              overall={sections.featuredOverall}
              byGenre={sections.featuredByGenre}
              genres={genres}
              excludePlaylistIds={completedIds}
            />
          ) : (
            <SectionSkeleton />
          )}
          {user && <NewArrivalsSection playlists={sections.newArrivals} />}
          {COLLECTIONS_ENABLED && <NewCollectionsSection collections={collections} playlists={sections.all} />}
          <TagPickupSections pickups={sections.tagPickups} />
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
