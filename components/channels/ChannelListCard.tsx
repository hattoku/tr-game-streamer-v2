/**
 * チャンネルカード（ページ チャンネル 探す 仕様書 §3.2〜§3.4）。
 * 上段=チャンネル情報エリア（アイコン・チャンネル名・再生リスト数・動画数、クリックでチャンネル詳細へ）、
 * 下段=ピックアップ再生リストエリア（スコア上位3件、行クリックで動画プレーヤーへ）。
 * 遷移先が異なるため <a> の入れ子を避け、カード全体ではなく情報エリアと各行を個別の Link にする。
 * 名前が `components/playlists/ChannelCard.tsx`（再生リスト詳細の配信者カード）と衝突するため ListCard としている。
 */
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { InventoryIcon, PlayIcon, StarIcon, UserIcon } from '@/components/ui/icons';
import type { ChannelPickupPlaylist } from '@/lib/playlist-aggregates';

export interface ChannelCardData {
  id: string;
  name: string;
  iconUrl: string;
  playlistCount: number;
  videoCount: number;
  topPlaylists: ChannelPickupPlaylist[];
}

export function ChannelListCard({ channel }: { channel: ChannelCardData }) {
  // カード内にチャンネル詳細・各再生リストへの複数の遷移先を個別Linkで持つため、
  // Card自体には`interactive`（カード全体のホバー浮き上がり）を付けない
  // （components/mylist/MylistCard.tsxと同じ方針。ホバーの手がかりは各Link側のgroup-hover等で個別に出す）
  return (
    <Card className="flex flex-col gap-3">
      <Link href={`/channels/${encodeURIComponent(channel.id)}`} className="group flex gap-3">
        {/* アイコンは仕様どおり正方形（角丸）。yt3.ggpht.com の Referer 制限対策で no-referrer */}
        <div className="size-[72px] shrink-0 overflow-hidden rounded-[10px] bg-bg-btn">
          {channel.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={channel.iconUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" loading="lazy" />
          ) : (
            <div className="flex size-full items-center justify-center text-text-muted">
              <UserIcon size={28} />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <p className="truncate text-lg font-medium text-text-primary group-hover:text-text-secondary">{channel.name}</p>
          <div className="flex items-center gap-3 text-md text-text-tertiary">
            <span className="inline-flex items-center gap-1">
              <InventoryIcon size={13} />
              {channel.playlistCount.toLocaleString()} 再生リスト
            </span>
            <span className="inline-flex items-center gap-1">
              <PlayIcon size={11} />
              {channel.videoCount.toLocaleString()} 動画
            </span>
          </div>
        </div>
      </Link>

      {channel.topPlaylists.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-border-divider pt-3">
          {channel.topPlaylists.map((p) => (
            <li key={p.id}>
              <Link
                href={`/playlists/${encodeURIComponent(p.id)}`}
                className="flex items-center gap-3 rounded-[8px] px-1 py-1 hover:bg-bg-hover"
              >
                <div className="aspect-video w-[64px] shrink-0 overflow-hidden rounded-[6px] bg-bg-player">
                  {p.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
                  )}
                </div>
                <span className="min-w-0 flex-1 truncate text-base text-text-secondary">{p.title}</span>
                <span className="inline-flex shrink-0 items-center gap-1 text-md text-text-tertiary">
                  <StarIcon size={13} className="text-brand-score" />
                  {p.score == null ? (
                    <span className="text-text-muted">評価なし</span>
                  ) : (
                    <span className="font-semibold text-text-primary">{p.score.toFixed(1)}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
