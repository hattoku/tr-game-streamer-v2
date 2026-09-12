/**
 * バッジ類。
 * - TrendingBadge: 「↑ 注目上昇中」（共通 デザイントークン仕様書 §5.2）
 * - NewBadge:      「🔔 NEW」（ページ マイリスト機能仕様書 §5.4）。刺し色を増やさないため
 *                  未読ドット（§15.1）と同じ赤ドット＋白文字で表現する
 * - UnreadDot:     未読インジケーター（§15.1）
 * - CountBadge:    タブの件数バッジ（§15.2）
 */
import { cn } from './cn';
import { BellIcon } from './icons';

export function TrendingBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[4px] border-[0.5px] border-brand-trending bg-brand-trending-bg px-2 py-[3px] text-sm font-medium leading-none text-brand-trending',
        className,
      )}
    >
      ↑ 注目上昇中
    </span>
  );
}

export function NewBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[4px] border-[0.5px] border-border-strong bg-bg-btn px-2 py-[3px] text-sm font-medium leading-none text-text-primary',
        className,
      )}
    >
      <BellIcon size={11} />
      NEW
    </span>
  );
}

export function UnreadDot({ className }: { className?: string }) {
  return <span aria-label="未読" className={cn('inline-block size-[6px] rounded-full bg-brand-logo', className)} />;
}

export function CountBadge({ count, active = false, className }: { count: number; active?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'ml-[6px] inline-flex items-center rounded-[8px] bg-bg-btn px-[6px] py-px text-sm leading-[14px]',
        active ? 'text-text-primary' : 'text-text-tertiary',
        className,
      )}
    >
      {count}
    </span>
  );
}
