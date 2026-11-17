/**
 * チャンネルカード（ページ チャンネル 探す 仕様書 §3.2〜§3.4）。
 * 上段=チャンネル情報エリア（アイコン・チャンネル名・再生リスト数・動画数・レビューの合計件数（§9.3、段階5）、クリックでチャンネル詳細へ）、
 * 下段=ピックアップ再生リストエリア（スコア上位3件、行クリックで動画プレーヤーへ）。各行はタイトルの下に
 * スコア・マイリスト数・話数・最新話の日付を出す（§9.5、v2.3。どの再生リストが新しく更新されているかを一覧で分かるように）。
 * ピックアップより多く再生リストがあるときは、下に「ほか N 本の再生リスト すべて見る」の行を出し、
 * 次の再生リストのサムネイルを重ねて見せて、まだたくさんあることを伝える（§9.6、クリックでチャンネル詳細へ）。
 * 遷移先が異なるため <a> の入れ子を避け、カード全体ではなく情報エリアと各行を個別の Link にする。
 * 名前が `components/playlists/ChannelCard.tsx`（再生リスト詳細の配信者カード）と衝突するため ListCard としている。
 */
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { ChevronRightIcon, CommentIcon, InventoryIcon, PlayIcon, StarIcon, UserIcon, UsersIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { formatPublishedDate } from '@/components/playlists/VideoList';
import type { ChannelListItem } from '@/lib/catalog-shared';
import { FallbackImage } from '@/components/ui/FallbackImage';

export type ChannelCardData = ChannelListItem;

export function ChannelListCard({ channel }: { channel: ChannelCardData }) {
  const channelHref = `/channels/${encodeURIComponent(channel.id)}`;
  // ピックアップに出ていない再生リストの本数（§9.6）
  const restCount = channel.playlistCount - channel.topPlaylists.length;
  // カード内にチャンネル詳細・各再生リストへの複数の遷移先を個別Linkで持つため、
  // Card自体には`interactive`（カード全体のホバー浮き上がり）を付けない
  // （components/mylist/MylistCard.tsxと同じ方針。ホバーの手がかりは各Link側のgroup-hover等で個別に出す）
  return (
    <Card className="flex flex-col gap-3" data-testid="channel-card">
      <Link href={channelHref} className="group flex gap-3">
        {/* アイコンは仕様どおり正方形（角丸）。yt3.ggpht.com の Referer 制限対策で no-referrer */}
        <div className="size-[72px] shrink-0 overflow-hidden rounded-[10px] bg-bg-btn">
          <FallbackImage
            src={channel.iconUrl}
            className="size-full object-cover"
            loading="lazy"
            fallback={
              <div className="flex size-full items-center justify-center text-text-muted">
                <UserIcon size={28} />
              </div>
            }
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <p className="truncate text-lg font-medium text-text-primary group-hover:text-text-secondary">{channel.name}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-md text-text-tertiary">
            <span className="inline-flex items-center gap-1">
              <InventoryIcon size={13} />
              {channel.playlistCount.toLocaleString()} 再生リスト
            </span>
            <span className="inline-flex items-center gap-1">
              <PlayIcon size={11} />
              {channel.videoCount.toLocaleString()} 動画
            </span>
            <span className="inline-flex items-center gap-1">
              <CommentIcon size={13} />
              {(channel.reviewCount ?? 0).toLocaleString()} レビュー
            </span>
          </div>
        </div>
      </Link>

      {channel.topPlaylists.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border-divider pt-3">
          {/* 3行が「このチャンネルの全部」に見えないよう、選び方を小さく添える（§9.6）。
              まだ1件も評価が無いときに「評価の高い」と書くと不自然なので「主な」にする */}
          <p className="px-1 text-sm text-text-muted">
            {channel.topPlaylists.some((p) => p.score != null) ? '評価の高い再生リスト' : '主な再生リスト'}
          </p>
                    <ul className="flex flex-col gap-1">
            {channel.topPlaylists.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/playlists/${encodeURIComponent(p.id)}`}
                  className="flex items-center gap-3 rounded-[8px] px-1 py-1 hover:bg-bg-hover"
                >
                  <div className="relative aspect-video w-[64px] shrink-0 sm:w-[80px] overflow-hidden rounded-[6px] bg-bg-player">
                    {p.thumbnailUrl && (
                      // absolute化: 通常フローの子だと画像自身の縦横比がaspect-videoコンテナの高さに影響してしまうため
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                    )}
                  </div>
                  {/* 2段（§9.5）: 上=タイトル、下=スコア・マイリスト数・話数・最新話の日付。狭い画面では下段を折り返す */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-base text-text-secondary">{p.title}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-md text-text-tertiary">
                      <span className="inline-flex items-center gap-1">
                        <StarIcon size={13} className="text-brand-score" />
                        {p.score == null ? (
                          <span className="text-text-muted">評価なし</span>
                        ) : (
                          <span className="font-semibold text-text-primary">{p.score.toFixed(1)}</span>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1" title="マイリスト登録数">
                        <UsersIcon size={13} />
                        {p.mylistCount.toLocaleString()}
                        <span className="sr-only">マイリスト</span>
                      </span>
                      <span>{p.videoCount.toLocaleString()}話</span>
                      {/* 最新話の日付＝再生リストで一番新しい動画の投稿日（動画リストと同じ年つきの「2026/11/12」）。動画が無ければ出さない */}
                      {p.latestVideoPublishedAt != null && <span>最新話 {formatPublishedDate(p.latestVideoPublishedAt)}</span>}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {restCount > 0 && <MorePlaylistsRow href={channelHref} restCount={restCount} thumbnailUrls={channel.moreThumbnailUrls} />}
        </div>
      )}
    </Card>
  );
}

/**
 * 「ほか N 本の再生リスト すべて見る」の行（§9.6）。ピックアップ行とサムネイル・右端の位置を揃え、リストの続きに見せる。
 * サムネイルは残りの本数（最大3枚）だけ奥へずらして重ね、束になっている感じを出す。
 */
function MorePlaylistsRow({ href, restCount, thumbnailUrls }: { href: string; restCount: number; thumbnailUrls: string[] }) {
  const layerCount = Math.min(restCount, LAYER_CLASSES.length);
  return (
    <Link href={href} data-testid="channel-card-more" className="group flex items-center gap-3 rounded-[8px] px-1 pb-1 pt-3 hover:bg-bg-hover">
      <div className="relative aspect-video w-[64px] shrink-0 sm:w-[80px]" aria-hidden="true">
        {/* 奥の層から描いて手前の層を上に重ねる */}
        {Array.from({ length: layerCount }, (_, i) => layerCount - 1 - i).map((i) => (
          <div
            key={i}
            className={cn('absolute inset-0 overflow-hidden rounded-[6px] bg-bg-player shadow-control', LAYER_CLASSES[i])}
          >
            {thumbnailUrls[i] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnailUrls[i]} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
            )}
          </div>
        ))}
      </div>
      <span className="min-w-0 flex-1 truncate text-base text-text-secondary">
        ほか <span className="font-semibold text-text-primary">{restCount.toLocaleString()}</span> 本の再生リスト
      </span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-md text-text-tertiary group-hover:text-text-primary">
        すべて見る
        <ChevronRightIcon size={13} />
      </span>
    </Link>
  );
}

/** 重ねるサムネイルの各層（0=手前）。奥ほど上へずらして横幅を詰め、暗くする */
const LAYER_CLASSES = ['', '-translate-y-[5px] scale-x-[0.88] brightness-[0.7]', '-translate-y-[10px] scale-x-[0.76] brightness-[0.45]'];
