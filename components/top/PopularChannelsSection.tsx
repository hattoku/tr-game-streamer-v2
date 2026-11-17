/**
 * TOPページ 人気のチャンネルセクション（ページ top 仕様書 §6A、リブランディング段階5）。
 * 掲載中の再生リストがあるチャンネルを人気順（運営のピン留め→人気の点数。共通 人気のチャンネル 集計 仕様書 §5）に最大20件。
 * 並べ替えはサーバー側（共通 一覧のサーバー側検索 仕様書 §3.4 の `popularChannels`）。人気の点数は画面に出さない。
 * 対象が0件ならセクション自体を出さない。未ログイン・ログイン済みの両方に出す。
 * カードの件数は再生リスト詳細の配信者欄（components/playlists/ChannelCard.tsx）と同じ「N 再生リスト・N 動画・N マイリスト」（§6A.4、v2.3）。
 */
'use client';

import Link from 'next/link';
import { CarouselItem } from '@/components/ui/Carousel';
import { TopSection } from '@/components/top/TopSection';
import { InventoryIcon, PlayIcon, UserIcon, UsersIcon } from '@/components/ui/icons';
import type { PopularChannelItem } from '@/lib/catalog-shared';
import { FallbackImage } from '@/components/ui/FallbackImage';

export function PopularChannelsSection({ channels }: { channels: PopularChannelItem[] }) {
  if (channels.length === 0) return null;

  return (
    <TopSection title="人気のチャンネル" viewAllHref="/channels">
      {channels.map((c) => (
        <CarouselItem key={c.id}>
          <PopularChannelCard channel={c} />
        </CarouselItem>
      ))}
    </TopSection>
  );
}

/** 正方形のアイコン（大）・チャンネル名（最大2行）・件数（再生リスト・動画・マイリスト）を縦に並べたカード（§6A.4）。幅は CarouselItem の既定（PC 280px・スマートフォン 240px） */
function PopularChannelCard({ channel }: { channel: PopularChannelItem }) {
  return (
    <Link href={`/channels/${encodeURIComponent(channel.id)}`} className="group flex flex-col gap-2" data-testid="popular-channel-card">
      {/* yt3.ggpht.com の Referer 制限対策で no-referrer */}
      <div className="aspect-square w-full overflow-hidden rounded-[12px] bg-bg-btn transition-transform duration-[120ms] group-hover:-translate-y-[3px]">
        <FallbackImage
          src={channel.iconUrl}
          className="size-full object-cover"
          loading="lazy"
          fallback={
            <div className="flex size-full items-center justify-center text-text-muted">
              <UserIcon size={36} />
            </div>
          }
        />
      </div>
      {/* 名前が1行でも2行分の高さを取り、件数の位置をカード間でそろえる */}
      <p className="line-clamp-2 min-h-[2lh] text-base font-medium text-text-primary group-hover:text-text-secondary">{channel.name}</p>
      {/* 件数は幅によらず2行に固定（1行目 再生リスト・動画、2行目 マイリスト）。スマートフォンでは3つが1行に入らないため */}
      <div className="flex flex-col gap-1 text-md text-text-tertiary" data-testid="popular-channel-stats">
        <p className="flex items-center gap-x-3 whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            <InventoryIcon size={13} />
            {channel.playlistCount.toLocaleString()} 再生リスト
          </span>
          <span className="inline-flex items-center gap-1">
            <PlayIcon size={11} />
            {channel.videoCount.toLocaleString()} 動画
          </span>
        </p>
        <p className="inline-flex items-center gap-1 whitespace-nowrap">
          <UsersIcon size={13} />
          {channel.mylistCount.toLocaleString()} マイリスト
        </p>
      </div>
    </Link>
  );
}
