/**
 * Skeleton Screen（共通 デザイントークン仕様書 §9.1、UIコンポーネント仕様書 §9.2）。
 * 実コンテンツと同じサイズ・角丸・余白で置く。テキスト行は実コンテンツよりやや短く
 * （幅 60〜80%）、複数行では末尾を揃えない。
 */
import { cn } from './cn';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton', className)} />;
}

/** テキスト行のスケルトン。行ごとに幅を変えて「テキストらしさ」を出す */
export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  const widths = ['w-[80%]', 'w-[60%]', 'w-[70%]', 'w-[50%]'];
  return (
    <div aria-hidden className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={cn('skeleton h-[12px]', widths[i % widths.length])} />
      ))}
    </div>
  );
}
