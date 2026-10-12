/**
 * まとめカード（まとめ機能仕様書 §6.3）。タイトル／作成者名・作成日／説明文の冒頭（100文字）／
 * 再生リストのサムネイル最大3件（3列固定）／「全X件」・保存数。「全X件」は件数によらず下段に常に出す。
 * 説明文は高さを揃えるため2行で省略する（グリッド・カルーセルで並べるため）。
 * 自分のまとめ一覧（/collections/mine）で使い、公開設定バッジと操作列を `badge`・`actions` で差し込む。
 * まとめを探す（/collections）・TOPの新着のまとめでも使い、プロフィール（ステップ5）でも使う想定。
 * 作成者名はプロフィールページが未実装のためリンクにしない。
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { UserAvatar } from '@/components/layout/UserDropdown';
import { FavoriteIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { formatCollectionDate, type CollectionData } from '@/lib/collections';

const DESCRIPTION_EXCERPT_LENGTH = 100;
const MAX_THUMBNAILS = 3;

export function CollectionCard({
  collection: c,
  thumbnails,
  badge,
  actions,
  className,
}: {
  collection: CollectionData;
  /** 先頭から最大3件の再生リストのサムネイルURL（取得中は undefined） */
  thumbnails: string[] | undefined;
  badge?: ReactNode;
  actions?: ReactNode;
  /** グリッド・カルーセルで高さを揃える場合に h-full 等を渡す */
  className?: string;
}) {
  const href = `/collections/${c.id}`;
  const excerpt =
    c.description && c.description.length > DESCRIPTION_EXCERPT_LENGTH
      ? `${c.description.slice(0, DESCRIPTION_EXCERPT_LENGTH)}…`
      : c.description;

  return (
    <Card className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-2">
        {badge}
        <Link href={href} className="break-words text-xl font-medium text-text-primary hover:text-text-secondary">
          {c.title}
        </Link>
        <div className="flex items-center gap-2">
          <UserAvatar name={c.userDisplayName} imageUrl={c.userProfileImageUrl} size={20} />
          <span className="min-w-0 truncate text-md text-text-tertiary">{c.userDisplayName}</span>
          <span className="shrink-0 text-md text-text-muted">{formatCollectionDate(c.createdAt)} 作成</span>
        </div>
      </div>
      {excerpt && <p className="line-clamp-2 break-words text-base text-text-secondary">{excerpt}</p>}
      {/* サムネイルは件数によらず3列固定で幅をそろえる。遷移先はタイトルと同じため、キーボード・読み上げではタイトル側だけを対象にする */}
      <Link href={href} tabIndex={-1} aria-hidden className="mt-auto grid max-w-[480px] grid-cols-3 gap-2">
        {Array.from({ length: Math.min(MAX_THUMBNAILS, c.playlistIds.length) }, (_, i) => (
          <span key={i} className="relative block aspect-video overflow-hidden rounded-[6px] bg-bg-player">
            {thumbnails?.[i] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnails[i]} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
            )}
          </span>
        ))}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-3 text-md text-text-tertiary">
          <span>全{c.playlistIds.length}件</span>
          <span className="inline-flex items-center gap-1" aria-label={`保存数 ${c.savedCount}`}>
            <FavoriteIcon size={13} />
            {c.savedCount.toLocaleString()}
          </span>
        </span>
        {actions}
      </div>
    </Card>
  );
}
