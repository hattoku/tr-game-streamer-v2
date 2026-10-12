/**
 * プロフィールのマイリスト・レビュー履歴カード（ページ 設定 プロフィール仕様書 §7.3・§8.4）の共通の枠。
 * 左にサムネイル、右に再生リストタイトル（最大2行）・ゲームタイトル名・`meta`（ステータスや★）を並べ、
 * レビュー履歴のコメント・投稿日は `children` としてカード下段に差し込む。
 * サムネイル・タイトルは再生リスト詳細（動画プレーヤー）へ、ゲームタイトル名はゲームタイトル詳細へ遷移する。
 * 他人のマイリストも表示するため、マイリストページのカード（MylistCard）と違い操作は持たない。
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import type { ProfilePlaylistJson } from '@/lib/profile';

export function ProfilePlaylistCard({
  playlist: p,
  meta,
  children,
}: {
  playlist: ProfilePlaylistJson;
  meta: ReactNode;
  children?: ReactNode;
}) {
  const href = `/playlists/${p.id}`;
  return (
    // cn() は tailwind-merge を持たないため、独自の余白は flush で標準パディングを外してから付ける
    <Card flush className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex gap-3 md:gap-4">
        {/* 遷移先はタイトルと同じため、キーボード・読み上げではタイトル側だけを対象にする（CollectionCard と同じ） */}
        <Link href={href} tabIndex={-1} aria-hidden className="w-[128px] shrink-0 md:w-[176px]">
          <span className="relative block aspect-video overflow-hidden rounded-[8px] bg-bg-player">
            {p.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
            )}
          </span>
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
          <Link href={href} className="line-clamp-2 break-words text-base font-semibold leading-snug text-text-primary hover:text-text-secondary">
            {p.title}
          </Link>
          {p.gameName &&
            (p.gameId ? (
              <Link href={`/games/${p.gameId}`} className="truncate text-sm text-text-tertiary hover:text-text-primary">
                {p.gameName}
              </Link>
            ) : (
              <span className="truncate text-sm text-text-tertiary">{p.gameName}</span>
            ))}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">{meta}</div>
        </div>
      </div>
      {children}
    </Card>
  );
}
