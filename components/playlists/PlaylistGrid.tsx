/**
 * 公開再生リストのカードと関連ユーティリティ。
 * - `PlaylistCard`: カード1枚分（ページ 再生リストを探す 仕様書 §3.3。サムネイル／タイトル2行／チャンネル／
 *   スコア・マイリスト数・レビュー数／タグ）。タグは§3.5の表示優先順位（固定→登録日順）で最大3件+「+N」、
 *   絞り込み中のタグは太字で強調する。TOPページのカルーセル各セクション（components/top/）でも
 *   固定幅で1枚ずつ使う（フェーズ6ステップ2）。
 * - `PlaylistCardGrid`: `PlaylistCard`をグリッドで並べる（「再生リストを探す」・ゲーム/チャンネル詳細）。
 * - 一覧のデータは、サーバー側で絞り込み・並べ替え・ページングした1ページ分を API から受け取る
 *   （リブランディング段階7、共通 一覧のサーバー側検索 仕様書。呼び出しは lib/catalog.ts）。
 * - `fetchPublicPlaylists`: 公開再生リスト全件のクライアント取得。取り下げ中のまとめ機能（COLLECTIONS_ENABLED）でだけ使う。
 * 見た目: 共通 デザイントークン仕様書 v2.0 §6.1（カード・ホバーの浮き上がり）・§6.5（サムネイル: 下部オーバーレイ・
 * 話数「N話」）。クリックは詳細ページへの遷移でその場では再生しないため、サムネイルにボタンは重ねず
 * カード全体の浮き上がり（§6.1）のみでホバーを示す（ゲームタイトルカードと同じ方針）。
 */
'use client';

import Link from 'next/link';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card } from '@/components/ui/Card';
import { CountLabel } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tag } from '@/components/ui/Tag';
import { CommentIcon, InventoryIcon, StarIcon, UsersIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { LISTED } from '@/lib/listing';
import { fetchTagsMap, resolveTags, type TagInfo } from '@/lib/tags';
import type { PlaylistSummary } from '@/lib/catalog-shared';

export type { PlaylistSummary, PlaylistSort } from '@/lib/catalog-shared';

const MAX_VISIBLE_TAGS = 3;

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
    gameHint: (data.gameHint as string | null) ?? '',
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
    <Link href={`/playlists/${p.id}`} className={cn('block h-full', className)}>
      <Card interactive flush className="flex h-full flex-col">
        {/* サムネイル（§6.5）: 下部オーバーレイ・話数。ホバー表現はカード全体の浮き上がり（§6.1）のみ */}
        <div className="relative aspect-video w-full bg-bg-player">
          {p.thumbnailUrl && (
            // absolute化: 通常フローの子だと画像自身の縦横比がaspect-videoコンテナの高さに影響してしまうため
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
          )}
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[46%] bg-thumb-overlay" />
          <CountLabel className="absolute bottom-2 right-2">{p.videoCount}話</CountLabel>
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

/**
 * 公開かつ掲載中の再生リスト全件をクライアントで取得する。取り下げ中のまとめ機能（`/collections`・
 * まとめの再生リスト選択。COLLECTIONS_ENABLED が false の間は呼ばれない）でだけ使う。
 * 検索面（探す・TOP・ゲーム・チャンネル）はサーバー側検索（lib/catalog.ts）を使うこと。まとめを戻すときは、
 * 全件取得をやめてサーバー側検索に載せ替える（共通 一覧のサーバー側検索 仕様書 §6）。
 */
export async function fetchPublicPlaylists(): Promise<PlaylistSummary[]> {
  const [snap, tagsMap] = await Promise.all([
    getDocs(query(collection(db, 'playlists'), where('isPublic', '==', true), where('listingStatus', '==', LISTED))),
    fetchTagsMap(),
  ]);
  return snap.docs.map((d) => toSummary(d, tagsMap));
}
