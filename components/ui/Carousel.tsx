/**
 * 横スクロール（カルーセル）形式のカード列（共通 デザイントークン仕様書 v2.1 §6.7）。
 * TOPページの各セクション（マイリスト・注目の再生リスト・新着・タグピックアップ、components/top/）で使う。
 * ネイティブ横スクロール＋スクロールスナップ。PC（md以上）のみ、送りボタン（‹ ›）を`TopSection`側の
 * ヘッダーに置く（このコンポーネントは送り対象のスクロール要素そのもの。`ref`で外から`scrollBy`する）。
 * モバイルは左右16px余白の外までカードをブリードさせ、スワイプのみで操作する。
 */
'use client';

import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { cn } from './cn';

interface CarouselProps extends Omit<ComponentProps<'div'>, 'role' | 'aria-label' | 'children'> {
  children: ReactNode;
  ariaLabel: string;
}

export const Carousel = forwardRef<HTMLDivElement, CarouselProps>(function Carousel({ children, ariaLabel, className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      role="group"
      aria-label={ariaLabel}
      className={cn(
        '-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

/** カルーセル内の1カード分のラッパー。幅固定＋スナップ位置を指定する */
export function CarouselItem({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('w-[240px] shrink-0 snap-start md:w-[280px]', className)}>{children}</div>;
}
