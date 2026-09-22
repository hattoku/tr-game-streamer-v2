/**
 * 公開再生リストのカードと関連ユーティリティ。
 * - `PlaylistCard`: カード1枚分（ページ 再生リストを探す 仕様書 §3.3。サムネイル／タイトル2行／チャンネル／
 *   スコア・マイリスト数・レビュー数／タグ）。タグは§3.5の表示優先順位（固定→登録日順）で最大3件+「+N」、
 *   絞り込み中のタグは太字で強調する。TOPページのカルーセル各セクション（components/top/）でも
 *   固定幅で1枚ずつ使う（フェーズ6ステップ2）。
 * - `PlaylistCardGrid`: `PlaylistCard`をグリッドで並べる（「再生リストを探す」・ゲーム/チャンネル詳細）。
 * - `fetchPlaylistsByGame`・`fetchPlaylistsByChannel`・`fetchPublicPlaylists`・`sortPlaylists`:
 *   ゲームタイトル詳細ページの「関連する再生リスト」節（components/games/GamePlaylistSection.tsx）・
 *   チャンネル詳細ページの「再生リスト一覧」節（app/(main)/channels/[channelId]/page.tsx）・「再生リストを探す」
 *   本実装（`app/(main)/playlists/page.tsx`）・TOPページ（`app/(main)/page.tsx`）向けに、データ取得と
 *   ページング・ソートを呼び出し側に委ねられるよう分離したもの
 *   （一覧セクションの共通UIは components/playlists/PlaylistListSection.tsx）。
 * 見た目: 共通 デザイントークン仕様書 v2.0 §6.1（カード・ホバーの浮き上がり）・§6.5（サムネイル: 下部オーバーレイ・
 * 話数「N話」・ホバー時の再生ボタン）。
 */
'use client';

import Link from 'next/link';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card } from '@/components/ui/Card';
import { CountLabel } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tag } from '@/components/ui/Tag';
import { CommentIcon, InventoryIcon, PlayIcon, StarIcon, UsersIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { fetchTagsMap, resolveTags, type ResolvedTag, type TagInfo } from '@/lib/tags';

const MAX_VISIBLE_TAGS = 3;

export interface PlaylistSummary {
  id: string;
  title: string;
  thumbnailUrl: string;
  channelName: string;
  channelIconUrl: string;
  gameId: string | null;
  gameName: string;
  /** 登録時にゲームタイトルの`genreId`から1件セットされるジャンルID（register/route.ts参照）。TOPページ注目セクションのジャンルタブ絞り込みで使用 */
  gameGenreIds: string[];
  videoCount: number;
  score: number | null;
  mylistCount: number;
  reviewCount: number;
  latestVideoPublishedAt: number | null;
  registeredAt: number;
  tags: ResolvedTag[];
}

const GRID_CLASS = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

function toSummary(d: { id: string; data(): Record<string, unknown> }, tagsMap?: Map<string, TagInfo>): PlaylistSummary {
  const data = d.data();
  return {
    id: d.id,
    title: (data.title as string) ?? '',
    thumbnailUrl: (data.thumbnailUrl as string) ?? '',
    channelName: (data.channelName as string) ?? '',
    channelIconUrl: (data.channelIconUrl as string) ?? '',
    gameId: (data.gameId as string | null) ?? null,
    gameName: (data.gameName as string) ?? '',
    gameGenreIds: (data.gameGenreIds as string[]) ?? [],
    videoCount: (data.videoCount as number) ?? 0,
    score: (data.score as number | null) ?? null,
    mylistCount: (data.mylistCount as number) ?? 0,
    reviewCount: (data.reviewCount as number) ?? 0,
    latestVideoPublishedAt: (data.latestVideoPublishedAt as { toMillis(): number } | null)?.toMillis?.() ?? null,
    registeredAt: (data.registeredAt as { toMillis(): number } | undefined)?.toMillis?.() ?? 0,
    tags: tagsMap
      ? resolveTags((data.playlistTagIds as string[]) ?? [], (data.playlistTagsFixed as string[]) ?? [], tagsMap)
      : [],
  };
}

/**
 * 再生リストカード1枚分。「再生リストを探す」仕様書 §3.3 準拠。
 * グリッド（`PlaylistCardGrid`）・TOPページのカルーセル（`components/top/`、固定幅で`className`指定）で使う。
 */
export function PlaylistCard({
  playlist: p,
  highlightTagIds,
  className,
}: {
  playlist: PlaylistSummary;
  highlightTagIds?: Set<string>;
  className?: string;
}) {
  return (
    <Link href={`/playlists/${p.id}`} className={cn('group block h-full', className)}>
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
              // referrerPolicy: yt3.ggpht.com の Referer 制限対策（PlaylistSummary 参照）
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.channelIconUrl} alt="" referrerPolicy="no-referrer" className="size-5 shrink-0 rounded-full" loading="lazy" />
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
          {p.tags.length > 0 && (
            <div className="flex flex-wrap gap-[6px]">
              {p.tags.slice(0, MAX_VISIBLE_TAGS).map((t) => (
                <Tag key={t.id} className={cn(highlightTagIds?.has(t.id) && 'font-bold text-text-primary')}>
                  {t.name}
                </Tag>
              ))}
              {p.tags.length > MAX_VISIBLE_TAGS && <Tag>+{p.tags.length - MAX_VISIBLE_TAGS}</Tag>}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}

/** 再生リストカードグリッド（データは呼び出し側が用意する場合） */
export function PlaylistCardGrid({
  playlists,
  highlightTagIds,
}: {
  playlists: PlaylistSummary[];
  highlightTagIds?: Set<string>;
}) {
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
          <PlaylistCard playlist={p} highlightTagIds={highlightTagIds} />
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
  const [snap, tagsMap] = await Promise.all([
    getDocs(query(collection(db, 'playlists'), where('isPublic', '==', true), where('gameId', '==', gameId))),
    fetchTagsMap(),
  ]);
  return snap.docs.map((d) => toSummary(d, tagsMap));
}

/**
 * 指定チャンネルの公開再生リストを取得する（チャンネル詳細ページ「再生リスト一覧」節、
 * ページ チャンネル 詳細 仕様書 第4章）。`fetchPlaylistsByGame`と同じく等価条件のみのため複合indexは不要。
 * 呼び出し側: app/(main)/channels/[channelId]/page.tsx
 */
export async function fetchPlaylistsByChannel(channelId: string): Promise<PlaylistSummary[]> {
  const [snap, tagsMap] = await Promise.all([
    getDocs(query(collection(db, 'playlists'), where('isPublic', '==', true), where('channelId', '==', channelId))),
    fetchTagsMap(),
  ]);
  return snap.docs.map((d) => toSummary(d, tagsMap));
}

/**
 * 公開再生リスト全件を取得する（「再生リストを探す」本実装 `app/(main)/playlists/page.tsx`、
 * TOPページ `app/(main)/page.tsx`）。カタログ規模が小さい前提で全件クライアント取得＋
 * クライアント側フィルタ・ソート・ページングとする（`/games`と同じ簡易実装方針）。
 */
export async function fetchPublicPlaylists(): Promise<PlaylistSummary[]> {
  const [snap, tagsMap] = await Promise.all([
    getDocs(query(collection(db, 'playlists'), where('isPublic', '==', true))),
    fetchTagsMap(),
  ]);
  return snap.docs.map((d) => toSummary(d, tagsMap));
}
