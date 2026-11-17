/**
 * 掲載チャンネルのアイコン（exploration_channels.channelIconUrl）。
 * 「掲載チャンネル」画面のカードと「自動掲載の確認」画面のチャンネル見出しで使う。アイコンが無い・読めなければ丸い枠だけ出す。
 */
import { cn } from '@/components/ui/cn';
import { FallbackImage } from '@/components/ui/FallbackImage';

export function ChannelAvatar({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  // 大きさは className で渡す（既定は size-10）。cn は Tailwind のクラスを上書き統合しないので、既定とは併記しない
  const sizeClass = className ?? 'size-10';
  // アイコンが読めない（配信者が差し替えて古いURLが切れた等）ときも丸い枠だけ出す
  return (
    <FallbackImage
      src={src}
      alt={alt}
      className={cn('shrink-0 rounded-full object-cover', sizeClass)}
      loading="lazy"
      fallback={<span className={cn('shrink-0 rounded-full bg-bg-hover', sizeClass)} />}
    />
  );
}
