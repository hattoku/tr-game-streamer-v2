/**
 * 公開再生リストのカードと関連ユーティリティ。
 * - `PlaylistCard`: カード1枚分（ページ 再生リストを探す 仕様書 §3.3。サムネイル／タイトル2行／チャンネル／
 *   スコア・マイリスト数・レビュー数／タグ）。タグは§3.5の表示優先順位（固定→登録日順）で最大3件+「+N」、
 *   絞り込み中のタグは太字で強調する。TOPページのカルーセル各セクション（components/top/）でも
 *   固定幅で1枚ずつ使う（フェーズ6ステップ2）。
 * - `PlaylistCardGrid`: `PlaylistCard`をグリッドで並べる（「再生リストを探す」・ゲーム/チャンネル詳細）。
 * - 一覧のデータは、サーバー側で絞り込み・並べ替え・ページングした1ページ分を API から受け取る
 *   （リブランディング段階7、共通 一覧のサーバー側検索 仕様書。呼び出しは lib/catalog.ts）。
 * 見た目: 共通 デザイントークン仕様書 v2.0 §6.1（カード・ホバーの浮き上がり）・§6.5（サムネイル。再生リストの表紙へ
 * 遷移するためサムネイルには何も重ねず、話数「N話」はスコアの行のスコアの次に置く）。クリックは詳細ページへの遷移でその場では再生しないため、サムネイルにボタンは重ねず
 * カード全体の浮き上がり（§6.1）のみでホバーを示す（ゲームタイトルカードと同じ方針）。
 */
'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { EpisodeCount } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tag } from '@/components/ui/Tag';
import { CommentIcon, InventoryIcon, StarIcon, UsersIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import type { PlaylistSummary } from '@/lib/catalog-shared';
import { FallbackImage } from '@/components/ui/FallbackImage';

export type { PlaylistSummary, PlaylistSort } from '@/lib/catalog-shared';

const MAX_VISIBLE_TAGS = 3;

const GRID_CLASS = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

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
        {/* サムネイル（§6.5）: 再生リストの表紙へ遷移するため何も重ねない（話数は下のスコアの行）。ホバー表現はカード全体の浮き上がり（§6.1）のみ */}
        <div className="relative aspect-video w-full bg-bg-player">
          {p.thumbnailUrl && (
            // absolute化: 通常フローの子だと画像自身の縦横比がaspect-videoコンテナの高さに影響してしまうため
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 px-[14px] pb-[14px] pt-3">
          <p className="line-clamp-2 text-lg font-medium leading-snug text-text-primary">{p.title}</p>
          <div className="flex items-center gap-2">
            <FallbackImage src={p.channelIconUrl} className="size-5 shrink-0 rounded-full" loading="lazy" fallback={<span className="size-5 shrink-0 rounded-full bg-bg-btn" />} />
            <span className="truncate text-md text-text-tertiary">{p.channelName}</span>
          </div>
          {/* スコア・話数・マイリスト数・レビュー数（探す仕様書 §3.3）。レビュー0件は「評価なし」 */}
          <div className="mt-auto flex items-center gap-3 text-md text-text-tertiary">
            <span className="inline-flex items-center gap-1">
              <StarIcon size={13} className="text-brand-score" />
              {p.score == null ? <span className="text-text-muted">評価なし</span> : <span className="font-semibold text-text-primary">{p.score.toFixed(1)}</span>}
            </span>
            <EpisodeCount count={p.videoCount} />
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
