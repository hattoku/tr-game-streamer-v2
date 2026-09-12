/**
 * 標準カード（共通 デザイントークン仕様書 §6.1）とカード内セパレーター（§6.2）。
 * クリック可能なカード（マイリストの再生リストカード等）は interactive を指定すると
 * ホバーで枠線が強調される（§11.1）。
 */
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn';

interface CardProps extends ComponentProps<'div'> {
  interactive?: boolean;
  /** パディングを無くす（内部で独自にレイアウトする場合） */
  flush?: boolean;
  children: ReactNode;
}

export function Card({ interactive = false, flush = false, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[10px] border-[0.5px] border-border-default bg-bg-card',
        !flush && 'p-[18px]',
        interactive && 'transition-[border-color] duration-[120ms] hover:border-border-strong',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** カード内セパレーター（§6.2） */
export function CardDivider({ className }: { className?: string }) {
  return <div role="separator" className={cn('border-t-[0.5px] border-border-subtle', className)} />;
}

/** カード内のセクション見出し（§3.2 font-size-xl、§3.3 medium） */
export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h2 className={cn('text-xl font-medium text-text-primary', className)}>{children}</h2>;
}
