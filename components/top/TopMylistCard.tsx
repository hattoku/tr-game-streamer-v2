/**
 * TOPページ マイリストセクションのカード（ページ top 仕様書 §5.4）。
 * マイリストページのカード（components/mylist/MylistCard.tsx）と異なり、ステータス変更・逆順トグル・
 * 削除の操作は持たない一覧専用の簡易カード（§5.4 実装注記）。カード全体がクリック可能なため
 * `/playlists/[id]`への`Link`にする（詳細ページへの遷移。最後に開いた話数から続きを再生できる状態で開く。
 * その場での自動再生はしない）。
 */
import Link from 'next/link';
import { Card, CardChildArea } from '@/components/ui/Card';
import { CountLabel, NewBadge } from '@/components/ui/Badge';
import { StatusChip } from '@/components/ui/Chip';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { MylistEntry } from '@/lib/mylist-entries';

export function TopMylistCard({ entry, className }: { entry: MylistEntry; className?: string }) {
  const href = `/playlists/${entry.playlistId}`;
  const p = entry.playlist;

  return (
    <Link href={href} className={className}>
      <Card interactive flush className="flex h-full flex-col">
        <div className="relative aspect-video w-full bg-bg-player">
          {p?.thumbnailUrl && (
            // absolute化: 通常フローの子だと画像自身の縦横比がaspect-videoコンテナの高さに影響してしまうため
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
          )}
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[46%] bg-thumb-overlay" />
          {p && <CountLabel className="absolute bottom-2 right-2">{p.videoCount}話</CountLabel>}
        </div>
        <div className="flex flex-1 flex-col gap-2 px-[14px] pb-[14px] pt-3">
          <p className="line-clamp-2 text-lg font-medium leading-snug text-text-primary">
            {p?.title ?? '（再生リスト情報が見つかりません）'}
          </p>
          {p && <span className="truncate text-md text-text-tertiary">{p.channelName}</span>}
          <div className="mt-auto">
            <StatusChip status={entry.watchStatus} active readOnly />
          </div>
        </div>

        {entry.lastPlayed ? (
          <CardChildArea className="flex items-center gap-[10px] px-[14px]">
            <div className="flex w-[64px] shrink-0 flex-col">
              <span className="relative block aspect-video overflow-hidden rounded-t-[6px] bg-bg-player">
                {entry.lastPlayed.thumbnailUrl && (
                  // absolute化: 通常フローの子だと画像自身の縦横比がaspect-videoコンテナの高さに影響してしまうため
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.lastPlayed.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                )}
              </span>
              <ProgressBar value={entry.lastPlayed.percent} size="md" className="rounded-t-none rounded-b-[6px]" label="前回の再生位置" />
            </div>
            <p className="line-clamp-2 min-w-0 flex-1 text-sm text-text-secondary">{entry.lastPlayed.title}</p>
          </CardChildArea>
        ) : entry.hasNew ? (
          <CardChildArea className="flex items-center gap-2 px-[14px]">
            <NewBadge />
            <span className="text-sm text-text-secondary">新着動画があります</span>
          </CardChildArea>
        ) : null}
      </Card>
    </Link>
  );
}
