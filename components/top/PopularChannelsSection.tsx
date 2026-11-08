/**
 * TOPページ 人気のチャンネルセクション（ページ top 仕様書 §6A、リブランディング段階5）。
 * 掲載中の再生リストがあるチャンネルを人気順（運営のピン留め→人気の点数。共通 人気のチャンネル 集計 仕様書 §5）に最大20件。
 * 並べ替えはサーバー側（共通 一覧のサーバー側検索 仕様書 §3.4 の `popularChannels`）。人気の点数は画面に出さない。
 * 対象が0件ならセクション自体を出さない。未ログイン・ログイン済みの両方に出す。
 */
'use client';

import Link from 'next/link';
import { CarouselItem } from '@/components/ui/Carousel';
import { TopSection } from '@/components/top/TopSection';
import { InventoryIcon, UserIcon } from '@/components/ui/icons';
import type { PopularChannelItem } from '@/lib/catalog-shared';

export function PopularChannelsSection({ channels }: { channels: PopularChannelItem[] }) {
  if (channels.length === 0) return null;

  return (
    <TopSection title="人気のチャンネル" viewAllHref="/channels">
      {channels.map((c) => (
        <CarouselItem key={c.id} className="w-[112px] md:w-[140px]">
          <PopularChannelCard channel={c} />
        </CarouselItem>
      ))}
    </TopSection>
  );
}

/** 正方形のアイコン（大）・チャンネル名（最大2行）・「再生リスト N」を縦に並べた小さいカード（§6A.4） */
function PopularChannelCard({ channel }: { channel: PopularChannelItem }) {
  return (
    <Link href={`/channels/${encodeURIComponent(channel.id)}`} className="group flex flex-col gap-2" data-testid="popular-channel-card">
      {/* yt3.ggpht.com の Referer 制限対策で no-referrer */}
      <div className="aspect-square w-full overflow-hidden rounded-[12px] bg-bg-btn transition-transform duration-[120ms] group-hover:-translate-y-[3px]">
        {channel.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={channel.iconUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="flex size-full items-center justify-center text-text-muted">
            <UserIcon size={36} />
          </div>
        )}
      </div>
      <p className="line-clamp-2 text-base font-medium text-text-primary group-hover:text-text-secondary">{channel.name}</p>
      <p className="inline-flex items-center gap-1 text-md text-text-tertiary">
        <InventoryIcon size={13} />
        再生リスト {channel.playlistCount.toLocaleString()}
      </p>
    </Link>
  );
}
