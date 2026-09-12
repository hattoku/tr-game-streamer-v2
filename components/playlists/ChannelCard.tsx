/**
 * 配信者情報セクション（ページ 再生リスト詳細 仕様書「配信者情報セクション」）。
 * チャンネルアイコン（円形）／チャンネル名／「他の再生リストを見る →」。いずれもチャンネル詳細
 * （/channels/[channelId]）へ遷移する（ページ本体はフェーズ3以降のため当面 404）。
 */
import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui/Card';

interface ChannelCardProps {
  channelId: string;
  name: string;
  iconUrl: string;
}

export function ChannelCard({ channelId, name, iconUrl }: ChannelCardProps) {
  const href = `/channels/${channelId}`;
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle className="text-md font-normal text-text-muted">配信者</CardTitle>
      <div className="flex items-center gap-3">
        <Link href={href} className="shrink-0">
          {iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={iconUrl} alt="" className="size-12 rounded-full bg-bg-btn object-cover" />
          ) : (
            <span className="block size-12 rounded-full bg-bg-btn" />
          )}
        </Link>
        <Link href={href} className="min-w-0 text-lg text-text-primary hover:text-text-secondary">
          <span className="line-clamp-2">{name}</span>
        </Link>
      </div>
      <Link href={href} className="text-md text-text-tertiary hover:text-text-primary">
        他の再生リストを見る →
      </Link>
    </Card>
  );
}
