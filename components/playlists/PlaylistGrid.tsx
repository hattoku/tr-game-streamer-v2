/**
 * 公開再生リストのカードグリッド。
 * TOP 最小版（`app/(main)/page.tsx`）と「再生リストを探す」最小版（`app/(main)/playlists/page.tsx`）で共用。
 * playlists を isPublic == true ＋ registeredAt 降順（firestore.indexes.json に複合索引あり）で取得する。
 * 検索・絞り込み・ソート（ページ 再生リストを探す 仕様書）はフェーズ3以降。
 * カードの構成: ページ 再生リストを探す 仕様書 §3.3（サムネイル／タイトル2行／チャンネル／スコア・マイリスト数・
 * レビュー数／タグ）。タグはタグ機能がフェーズ3のため、当面ゲームタイトルを先頭タグとして置く。
 * 見た目: 共通 デザイントークン仕様書 v2.0 §6.1（カード・ホバーの浮き上がり）・§6.5（サムネイル: 下部オーバーレイ・
 * 話数「N話」・ホバー時の再生ボタン）。
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card } from '@/components/ui/Card';
import { CountLabel } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { Tag } from '@/components/ui/Tag';
import { CommentIcon, InventoryIcon, PlayIcon, StarIcon, UsersIcon } from '@/components/ui/icons';

interface PlaylistSummary {
  id: string;
  title: string;
  thumbnailUrl: string;
  channelName: string;
  channelIconUrl: string;
  gameName: string;
  videoCount: number;
  score: number | null;
  mylistCount: number;
  reviewCount: number;
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
            score: d.data().score ?? null,
            mylistCount: d.data().mylistCount ?? 0,
            reviewCount: d.data().reviewCount ?? 0,
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
          <Card key={i} flush>
            <Skeleton className="aspect-video w-full rounded-none" />
            <SkeletonText lines={2} className="p-3" />
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
          <Link href={`/playlists/${p.id}`} className="group block h-full">
            <Card interactive flush className="flex h-full flex-col">
              {/* サムネイル（§6.5）: 下部オーバーレイ・話数・ホバー時の再生ボタン */}
              <div className="relative aspect-video w-full bg-bg-player">
                {p.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
                )}
                <div aria-hidden className="absolute inset-x-0 bottom-0 h-[46%] bg-thumb-overlay" />
                <CountLabel className="absolute bottom-2 right-2">{p.videoCount}話</CountLabel>
                <span
                  aria-hidden
                  className="absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-primary text-white opacity-0 shadow-primary transition-opacity duration-[120ms] group-hover:opacity-100"
                >
                  <PlayIcon size={20} />
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 px-[14px] pb-[14px] pt-3">
                <p className="line-clamp-2 text-lg font-medium leading-snug text-text-primary">{p.title}</p>
                <div className="flex items-center gap-2">
                  {p.channelIconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.channelIconUrl} alt="" className="size-5 shrink-0 rounded-full" loading="lazy" />
                  ) : (
                    <span className="size-5 shrink-0 rounded-full bg-bg-btn" />
                  )}
                  <span className="truncate text-md text-text-tertiary">{p.channelName}</span>
                </div>
                {/* スコア・マイリスト数・レビュー数（探す仕様書 §3.3）。レビュー0件は「評価なし」 */}
                <div className="mt-auto flex items-center gap-3 text-md text-text-tertiary">
                  <span className="inline-flex items-center gap-1">
                    <StarIcon size={13} className="text-brand-score" />
                    {p.score == null ? <span className="text-text-muted">評価なし</span> : <span className="font-semibold text-text-primary">{p.score.toFixed(1)}</span>}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <UsersIcon size={13} />
                    {p.mylistCount.toLocaleString()}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CommentIcon size={13} />
                    {p.reviewCount.toLocaleString()}
                  </span>
                </div>
                {p.gameName && (
                  <div className="flex flex-wrap gap-[6px]">
                    <Tag emphasis>{p.gameName}</Tag>
                  </div>
                )}
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
