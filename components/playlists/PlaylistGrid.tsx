/**
 * 公開再生リストのカードグリッドと関連ユーティリティ。
 * - `PlaylistGrid`: TOP最小版（`app/(main)/page.tsx`）と「再生リストを探す」最小版
 *   （`app/(main)/playlists/page.tsx`）で使用。isPublic==true＋registeredAt降順
 *   （firestore.indexes.jsonに複合索引あり）で新着順に最大`max`件取得する。
 *   検索・絞り込み・ソート（ページ 再生リストを探す 仕様書）はフェーズ3ステップ4。
 * - `PlaylistCardGrid`・`fetchPlaylistsByGame`・`sortPlaylists`: ゲームタイトル詳細ページの
 *   「関連する再生リスト」節（components/games/GamePlaylistSection.tsx）向けに、データ取得と
 *   ページング・ソートを呼び出し側に委ねられるよう分離したもの。
 * カードの構成: ページ 再生リストを探す 仕様書 §3.3（サムネイル／タイトル2行／チャンネル／スコア・マイリスト数・
 * レビュー数／タグ）。タグはタグ機能がフェーズ3ステップ3のため、当面ゲームタイトルを先頭タグとして置く。
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

function LoadingGrid() {
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

export interface PlaylistSummary {
  id: string;
  title: string;
  thumbnailUrl: string;
  channelName: string;
  channelIconUrl: string;
  gameId: string | null;
  gameName: string;
  videoCount: number;
  score: number | null;
  mylistCount: number;
  reviewCount: number;
  latestVideoPublishedAt: number | null;
  registeredAt: number;
}

const GRID_CLASS = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

function toSummary(d: { id: string; data(): Record<string, unknown> }): PlaylistSummary {
  const data = d.data();
  return {
    id: d.id,
    title: (data.title as string) ?? '',
    thumbnailUrl: (data.thumbnailUrl as string) ?? '',
    channelName: (data.channelName as string) ?? '',
    channelIconUrl: (data.channelIconUrl as string) ?? '',
    gameId: (data.gameId as string | null) ?? null,
    gameName: (data.gameName as string) ?? '',
    videoCount: (data.videoCount as number) ?? 0,
    score: (data.score as number | null) ?? null,
    mylistCount: (data.mylistCount as number) ?? 0,
    reviewCount: (data.reviewCount as number) ?? 0,
    latestVideoPublishedAt: (data.latestVideoPublishedAt as { toMillis(): number } | null)?.toMillis?.() ?? null,
    registeredAt: (data.registeredAt as { toMillis(): number } | undefined)?.toMillis?.() ?? 0,
  };
}

/** 再生リストカードグリッド（データは呼び出し側が用意する場合） */
export function PlaylistCardGrid({ playlists }: { playlists: PlaylistSummary[] }) {
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

export type PlaylistSort = 'score' | 'mylist' | 'newest';

export function sortPlaylists(list: PlaylistSummary[], sort: PlaylistSort): PlaylistSummary[] {
  const sorted = [...list];
  if (sort === 'mylist') {
    sorted.sort((a, b) => b.mylistCount - a.mylistCount);
  } else if (sort === 'newest') {
    sorted.sort((a, b) => (b.latestVideoPublishedAt ?? 0) - (a.latestVideoPublishedAt ?? 0));
  } else {
    // スコアが高い順（デフォルト）。評価なし（null）は末尾
    sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }
  return sorted;
}

/**
 * 指定ゲームの公開再生リストを取得する（ゲームタイトル詳細ページ「関連する再生リスト」節）。
 * `isPublic`+`gameId`の等価条件のみのクエリのため新規のFirestore複合indexは不要
 * （並び替え・ページングは取得後にJS側で行う想定。呼び出し側: components/games/GamePlaylistSection.tsx）。
 */
export async function fetchPlaylistsByGame(gameId: string): Promise<PlaylistSummary[]> {
  const snap = await getDocs(query(collection(db, 'playlists'), where('isPublic', '==', true), where('gameId', '==', gameId)));
  return snap.docs.map(toSummary);
}

/**
 * 公開再生リストのカードグリッド（TOP最小版・「再生リストを探す」最小版で使用）。
 * 新着順で最大`max`件を取得する。検索・絞り込み・ソート（ページ 再生リストを探す 仕様書）は
 * フェーズ3ステップ4。
 */
export function PlaylistGrid({ max = 24 }: { max?: number }) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'playlists'), where('isPublic', '==', true), orderBy('registeredAt', 'desc'), limit(max)))
      .then((snap) => setPlaylists(snap.docs.map(toSummary)))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [max]);

  if (error) {
    return (
      <p role="alert" className="text-base text-input-error">
        再生リストの取得に失敗しました: {error}
      </p>
    );
  }

  if (playlists === null) return <LoadingGrid />;

  return <PlaylistCardGrid playlists={playlists} />;
}
