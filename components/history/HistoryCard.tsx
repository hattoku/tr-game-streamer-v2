/**
 * 視聴履歴カード（ページ 視聴履歴 仕様書 §4.2・§4.3）。
 * サムネイル＋進捗バー・動画タイトル・配信者・三点リーダー（この動画の履歴を削除）。
 * サムネイル・タイトルのクリックで該当再生リストの動画プレーヤーページへ遷移する（§4.2）。
 * 実際の再開位置は遷移先が watch_progress の最新値から決めるため、ここでは playlistId のみ渡す。
 */
'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { MoreIcon } from '@/components/ui/icons';

export interface HistoryCardData {
  id: string;
  playlistId: string;
  progressPercent: number;
  video: { title: string; thumbnailUrl: string } | null;
  playlist: { channelName: string; channelIconUrl: string } | null;
}

interface HistoryCardProps {
  entry: HistoryCardData;
  onDelete: () => void;
}

export function HistoryCard({ entry, onDelete }: HistoryCardProps) {
  const href = `/playlists/${entry.playlistId}`;

  return (
    <Card flush className="relative">
      <Link href={href} className="flex gap-3 p-3 pr-10 md:gap-4 md:p-4">
        <div className="flex w-[128px] shrink-0 flex-col md:w-[224px]">
          <span className="block aspect-video overflow-hidden rounded-t-[8px] bg-bg-player">
            {entry.video?.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={entry.video.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
            )}
          </span>
          <ProgressBar value={entry.progressPercent} size="md" className="rounded-t-none rounded-b-[8px]" label="視聴進捗" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
          <p className="line-clamp-2 text-base font-semibold leading-snug text-text-primary">
            {entry.video?.title ?? '（動画情報が見つかりません）'}
          </p>
          {entry.playlist && (
            <div className="flex items-center gap-2">
              {entry.playlist.channelIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.playlist.channelIconUrl} alt="" className="size-[18px] shrink-0 rounded-full" loading="lazy" />
              ) : (
                <span className="size-[18px] shrink-0 rounded-full bg-bg-btn" />
              )}
              <span className="truncate text-sm text-text-tertiary">{entry.playlist.channelName}</span>
            </div>
          )}
        </div>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="メニュー"
            className="absolute right-2 top-2 rounded-[6px] p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
          >
            <MoreIcon size={18} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onDelete}>この動画の視聴履歴を削除</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Card>
  );
}
