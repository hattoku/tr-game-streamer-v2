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
  const lp = entry.lastPlayed;
  // 視聴中は「続きの話」のサムネを大きく出す（再生リストのアイキャッチは序盤の話のことが多く、
  // どこまで見たか分かりにくいため。§5.4）。取れなければ再生リストのサムネにフォールバック
  const thumbnailUrl = lp?.thumbnailUrl || p?.thumbnailUrl;

  return (
    <Link href={href} className={className}>
      <Card interactive flush className="flex h-full flex-col">
        <div className="relative aspect-video w-full bg-bg-player">
          {thumbnailUrl && (
            // absolute化: 通常フローの子だと画像自身の縦横比がaspect-videoコンテナの高さに影響してしまうため
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
          )}
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[46%] bg-thumb-overlay" />
          {p && (
            <CountLabel className="absolute bottom-2 right-2">
              {lp?.episodeNumber != null ? `${lp.episodeNumber} / ${p.videoCount}話` : `${p.videoCount}話`}
            </CountLabel>
          )}
          {lp && (
            <ProgressBar
              value={lp.percent}
              size="md"
              className="absolute inset-x-0 bottom-0 rounded-none"
              label="前回の再生位置"
            />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 px-[14px] pb-[14px] pt-3">
          <p className="line-clamp-2 text-lg font-medium leading-snug text-text-primary">
            {p?.title ?? '（再生リスト情報が見つかりません）'}
          </p>
          {p && (
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
          )}
          <div className="mt-auto">
            <StatusChip status={entry.watchStatus} active readOnly />
          </div>
        </div>

        {lp ? (
          <CardChildArea className="px-[14px]">
            <p className="line-clamp-2 text-sm text-text-secondary">
              <span className="mr-2 font-medium text-text-muted">続きから</span>
              {lp.title}
            </p>
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
