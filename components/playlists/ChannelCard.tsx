/**
 * 配信者情報セクション（ページ 再生リスト詳細 仕様書「配信者情報セクション」）。
 * チャンネルアイコン（円形）／チャンネル名／再生リスト数・動画数・マイリスト数／「他の再生リストを見る ›」（カード幅いっぱいのセカンダリボタン）。
 * いずれもチャンネル詳細（/channels/[channelId]、app/(main)/channels/[channelId]/page.tsx）へ遷移する。
 *
 * 件数はチャンネル詳細の見出しと同じく、一覧 API（/api/catalog/playlists?channelId=）が返す掲載中の再生リストの合計を使う
 * （YouTube API は使わない）。レビュー数は初期は集まらないため出さない（2026-11 ユーザビリティ改善）。
 * 読み込み中・失敗時は件数の行を出さない。
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LinkButton } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { ChevronRightIcon, InventoryIcon, PlayIcon, UsersIcon } from '@/components/ui/icons';
import { fetchPlaylistPage } from '@/lib/catalog';

interface ChannelCardProps {
  channelId: string;
  name: string;
  iconUrl: string;
}

interface ChannelStats {
  playlistCount: number;
  videoCount: number;
  mylistCount: number;
}

function useChannelStats(channelId: string): ChannelStats | null {
  const [stats, setStats] = useState<{ channelId: string; value: ChannelStats } | null>(null);
  useEffect(() => {
    if (!channelId) return;
    const controller = new AbortController();
    fetchPlaylistPage({ sort: 'score', page: 1, channelId }, controller.signal)
      .then((res) =>
        setStats({
          channelId,
          value: { playlistCount: res.total, videoCount: res.totalVideoCount, mylistCount: res.totalMylistCount ?? 0 },
        }),
      )
      .catch(() => {
        // 取り消し・失敗時は件数を出さないだけ（カード本体の導線は使える）
      });
    return () => controller.abort();
  }, [channelId]);
  // 別のチャンネルの再生リストへ移ったとき、前のチャンネルの件数を出さない
  return stats && stats.channelId === channelId ? stats.value : null;
}

export function ChannelCard({ channelId, name, iconUrl }: ChannelCardProps) {
  const href = `/channels/${channelId}`;
  const stats = useChannelStats(channelId);
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle className="text-md font-normal text-text-muted">配信者</CardTitle>
      <div className="flex items-center gap-3">
        <Link href={href} className="shrink-0">
          {iconUrl ? (
            // referrerPolicy: yt3.ggpht.com の Referer 制限対策（PlaylistSummary 参照）
            // eslint-disable-next-line @next/next/no-img-element
            <img src={iconUrl} alt="" referrerPolicy="no-referrer" className="size-12 rounded-full bg-bg-btn object-cover" />
          ) : (
            <span className="block size-12 rounded-full bg-bg-btn" />
          )}
        </Link>
        <div className="flex min-w-0 flex-col gap-1">
          <Link href={href} className="min-w-0 text-lg text-text-primary hover:text-text-secondary">
            <span className="line-clamp-2">{name}</span>
          </Link>
          {stats && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-md text-text-tertiary" data-testid="channel-card-stats">
              <span className="inline-flex items-center gap-1">
                <InventoryIcon size={13} />
                {stats.playlistCount.toLocaleString()} 再生リスト
              </span>
              <span className="inline-flex items-center gap-1">
                <PlayIcon size={11} />
                {stats.videoCount.toLocaleString()} 動画
              </span>
              <span className="inline-flex items-center gap-1">
                <UsersIcon size={13} />
                {stats.mylistCount.toLocaleString()} マイリスト
              </span>
            </div>
          )}
        </div>
      </div>
      <LinkButton href={href} variant="secondary" size="full">
        他の再生リストを見る
        <ChevronRightIcon size={14} />
      </LinkButton>
    </Card>
  );
}
