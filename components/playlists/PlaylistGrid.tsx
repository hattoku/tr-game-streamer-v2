/**
 * 公開再生リストのカードグリッド。
 * TOP 最小版（`app/(main)/page.tsx`）と「再生リストを探す」最小版（`app/(main)/playlists/page.tsx`）で共用。
 * playlists を isPublic == true ＋ registeredAt 降順（firestore.indexes.json に複合索引あり）で取得する。
 * 検索・絞り込み・ソート（ページ 再生リストを探す 仕様書）はフェーズ3以降。
 * カードの見た目: 共通 デザイントークン仕様書 §6.1（カード）・§11.1（ホバー）。
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { InventoryIcon } from '@/components/ui/icons';

interface PlaylistSummary {
  id: string;
  title: string;
  thumbnailUrl: string;
  channelName: string;
  channelIconUrl: string;
  gameName: string;
  videoCount: number;
}

const GRID_CLASS = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

export function PlaylistGrid({ max = 24 }: { max?: number }) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'playlists'), where('isPublic', '==', true), orderBy('registeredAt', 'desc'), limit(max)))
      .then((snap) =>
        setPlaylists(
          snap.docs.map((d) => ({
            id: d.id,
            title: d.data().title ?? '',
            thumbnailUrl: d.data().thumbnailUrl ?? '',
            channelName: d.data().channelName ?? '',
            channelIconUrl: d.data().channelIconUrl ?? '',
            gameName: d.data().gameName ?? '',
            videoCount: d.data().videoCount ?? 0,
          })),
        ),
      )
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [max]);

  if (error) {
    return (
      <p role="alert" className="text-base text-input-error">
        再生リストの取得に失敗しました: {error}
      </p>
    );
  }

  if (playlists === null) {
    return (
      <div className={GRID_CLASS} aria-busy="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} flush className="p-3">
            <Skeleton className="aspect-video w-full" />
            <SkeletonText lines={2} className="mt-3" />
          </Card>
        ))}
      </div>
    );
  }

  if (playlists.length === 0) {
    return (
      <EmptyState
        icon={<InventoryIcon />}
        title="まだ再生リストが登録されていません"
        description="管理者が再生リストを登録すると、ここに表示されます"
      />
    );
  }

  return (
    <ul className={GRID_CLASS}>
      {playlists.map((p) => (
        <li key={p.id}>
          <Link href={`/playlists/${p.id}`} className="block h-full">
            <Card interactive flush className="flex h-full flex-col overflow-hidden">
              <div className="relative aspect-video w-full bg-bg-player">
                {p.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
                )}
                <span className="absolute bottom-2 right-2 rounded-[4px] bg-black/75 px-[6px] py-[2px] text-sm text-text-primary">
                  全{p.videoCount}話
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="line-clamp-2 text-lg font-medium leading-snug text-text-primary">{p.title}</p>
                <div className="mt-auto flex items-center gap-2">
                  {p.channelIconUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.channelIconUrl} alt="" className="size-5 shrink-0 rounded-full" loading="lazy" />
                  )}
                  <span className="truncate text-md text-text-tertiary">{p.channelName}</span>
                </div>
                {p.gameName && <p className="truncate text-sm text-text-muted">🎮 {p.gameName}</p>}
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
