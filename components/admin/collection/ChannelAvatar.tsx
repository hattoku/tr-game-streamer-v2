/**
 * 掲載チャンネルのアイコン（exploration_channels.channelIconUrl）。
 * 「掲載チャンネル」画面のカードと「自動掲載の確認」画面のチャンネル見出しで使う。アイコンが無ければ丸い枠だけ出す。
 */
import { cn } from '@/components/ui/cn';

export function ChannelAvatar({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  // 大きさは className で渡す（既定は size-10）。cn は Tailwind のクラスを上書き統合しないので、既定とは併記しない
  const sizeClass = className ?? 'size-10';
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- YouTube のアイコンURL（外部・可変）をそのまま表示する
    <img src={src} alt={alt} referrerPolicy="no-referrer" className={cn('shrink-0 rounded-full object-cover', sizeClass)} loading="lazy" />
  ) : (
    <span className={cn('shrink-0 rounded-full bg-bg-hover', sizeClass)} />
  );
}
