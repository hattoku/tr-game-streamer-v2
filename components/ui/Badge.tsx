/**
 * バッジ類（共通 デザイントークン仕様書 v2.0）。
 * - TrendingBadge: 「↑ 注目上昇中」（§5.2）
 * - PlayingBadge:  「再生中」。サムネイル左上に重ねる赤いラベル（§5.3）
 * - CountLabel:    サムネイル右下の話数「N話」（§6.5。「全N話」とはしない）
 * - NewBadge:      「🔔 NEW」（ページ マイリスト機能仕様書 §5.4）。刺し色を増やさないため
 *                  未読ドット（§15.1）と同じ赤ドット＋白文字で表現する
 * - UnreadDot:     未読インジケーター（§15.1）
 * - CountBadge:    タブの件数バッジ（§15.2、ピル）
 */
import type { ReactNode } from 'react';
import { cn } from './cn';
import { BellIcon } from './icons';

export function TrendingBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[4px] border border-brand-trending bg-brand-trending-bg px-2 py-[3px] text-sm font-medium leading-none text-brand-trending',
        className,
      )}
    >
      ↑ 注目上昇中
    </span>
  );
}

export function PlayingBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-[4px] bg-brand-primary px-[7px] py-[2px] text-xs font-semibold leading-[1.5] text-white', className)}>
      再生中
    </span>
  );
}

/** サムネイル右下の話数・尺などの半透明ラベル（§6.5） */
export function CountLabel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-[4px] bg-black/72 px-[7px] py-[2px] text-sm leading-[1.5] text-text-primary', className)}>
      {children}
    </span>
  );
}

export function NewBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[4px] border border-border-control bg-bg-btn px-2 py-[3px] text-sm font-medium leading-none text-text-primary',
        className,
      )}
    >
      <BellIcon size={11} />
      NEW
    </span>
  );
}

export function UnreadDot({ className }: { className?: string }) {
  return (
    <span
      aria-label="未読"
      className={cn('inline-block size-[7px] rounded-full bg-brand-primary shadow-[0_0_0_2px_var(--color-bg-base)]', className)}
    />
  );
}

export function CountBadge({ count, active = false, className }: { count: number; active?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'ml-[6px] inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-[9px] px-[6px] text-sm font-semibold leading-none',
        active ? 'bg-bg-selected text-text-primary' : 'bg-bg-hover text-text-muted',
        className,
      )}
    >
      {count}
    </span>
  );
}
