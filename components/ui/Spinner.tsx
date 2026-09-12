/**
 * Spinner（共通 デザイントークン仕様書 §9.2、UIコンポーネント仕様書 §9.3）。
 * 色は color-spinner (#aaaaaa)。ボタン内などで使う場合は className で text-* を上書きする。
 */
import { cn } from './cn';

export function Spinner({ size = 16, className, label = '読み込み中' }: { size?: number; className?: string; label?: string }) {
  return (
    <svg
      role="status"
      aria-label={label}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin text-spinner', className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** ページ中央に置くローディング表示（スケルトンを用意しない小規模な箇所向け） */
export function CenteredSpinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex justify-center py-[60px]', className)}>
      <Spinner size={24} />
    </div>
  );
}
