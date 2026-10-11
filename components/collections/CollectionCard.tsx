/**
 * まとめカード（まとめ機能仕様書 §6.3）。タイトル／作成者名・作成日／説明文の冒頭（100文字）／
 * 再生リストのサムネイル最大3件＋「全X件」／保存数。
 * 自分のまとめ一覧（/collections/mine）で使い、公開設定バッジと操作列を `badge`・`actions` で差し込む。
 * まとめを探す（サブステップ4-2）・プロフィール（ステップ5）でも同じカードを使う想定。
 * 作成者名はプロフィールページが未実装のためリンクにしない。
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { UserAvatar } from '@/components/layout/UserDropdown';
import { FavoriteIcon } from '@/components/ui/icons';
import { formatCollectionDate, type CollectionData } from '@/lib/collections';

const DESCRIPTION_EXCERPT_LENGTH = 100;
const MAX_THUMBNAILS = 3;

export function CollectionCard({
  collection: c,
  thumbnails,
  badge,
  actions,
}: {
  collection: CollectionData;
  /** 先頭から最大3件の再生リストのサムネイルURL（取得中は undefined） */
  thumbnails: string[] | undefined;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  const href = `/collections/${c.id}`;
  const excerpt =
    c.description && c.description.length > DESCRIPTION_EXCERPT_LENGTH
      ? `${c.description.slice(0, DESCRIPTION_EXCERPT_LENGTH)}…`
      : c.description;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {badge}
        <Link href={href} className="break-words text-xl font-medium text-text-primary hover:text-text-secondary">
          {c.title}
        </Link>
        <div className="flex items-center gap-2">
          <UserAvatar name={c.userDisplayName} imageUrl={c.userProfileImageUrl} size={20} />
          <span className="min-w-0 truncate text-md text-text-tertiary">{c.userDisplayName}</span>
          <span className="shrink-0 text-md text-text-muted">{formatCollectionDate(c.createdAt)}</span>
        </div>
      </div>
      {excerpt && <p className="break-words text-base text-text-secondary">{excerpt}</p>}
      <Link href={href} className="flex items-center gap-2" aria-label={`${c.title}（全${c.playlistIds.length}件）`}>
        {Array.from({ length: Math.min(MAX_THUMBNAILS, c.playlistIds.length) }, (_, i) => (
          <span key={i} className="relative block aspect-video w-[30%] max-w-[160px] overflow-hidden rounded-[6px] bg-bg-player">
            {thumbnails?.[i] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnails[i]} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
            )}
          </span>
        ))}
        {c.playlistIds.length > MAX_THUMBNAILS && <span className="shrink-0 text-md text-text-muted">全{c.playlistIds.length}件</span>}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-md text-text-tertiary">
          <FavoriteIcon size={13} />
          {c.savedCount.toLocaleString()}
        </span>
        {actions}
      </div>
    </Card>
  );
}
