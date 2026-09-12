/**
 * 標準カード（共通 デザイントークン仕様書 v2.0 §6.1）とカード内セパレーター（§6.2）、子エリア（§6.6）。
 * 面は上端がわずかに明るいグラデーション＋1px の半透明白の枠＋影（§16 段階1）。
 * クリック可能なカード（再生リストカード・マイリストカード等）は interactive を指定すると
 * ホバーで 3px 浮き上がり、枠線と影が1段強くなる（§6.1「クリック可能なカードのホバー」）。
 * サムネイルをカード上端いっぱいに置くカードは flush でパディングを外し、本文側で余白を取る。
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
        'overflow-hidden rounded-[12px] border border-border-card bg-gradient-card shadow-card',
        !flush && 'p-[18px]',
        interactive &&
          'transition-[transform,border-color,box-shadow] duration-[120ms] hover:-translate-y-[3px] hover:border-border-card-hover hover:shadow-card-hover',
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
  return <div role="separator" className={cn('border-t border-border-divider', className)} />;
}

/** カード内のセクション見出し（§3.2 font-size-xl、§3.3 medium） */
export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h2 className={cn('text-xl font-medium text-text-primary', className)}>{children}</h2>;
}

/**
 * カード内の子エリア（§6.6）。親（再生リスト）と子（動画）を分けて見せる領域。
 * 上線＋わずかに明るい面。マイリストカードの「最後に再生した動画」等。
 */
export function CardChildArea({ className, children, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={cn('border-t border-border-divider bg-bg-child px-[18px] pt-3 pb-[14px]', className)} {...rest}>
      {children}
    </div>
  );
}

/** ページ・セクション見出し（§3.2 font-size-heading、§3.3 bold） */
export function SectionHeading({ className, children, as: Tag = 'h1' }: { className?: string; children: ReactNode; as?: 'h1' | 'h2' }) {
  return <Tag className={cn('text-heading font-bold text-text-primary', className)}>{children}</Tag>;
}
