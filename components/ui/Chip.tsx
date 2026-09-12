/**
 * 視聴ステータスチップ（共通 デザイントークン仕様書 v2.0 §5.1）。
 * - 非アクティブ: グレー（1px の半透明白の枠）
 * - アクティブ（視聴中）: シアングリーン＋左端ドット 6px。刺し色はこの状態のみ
 * - アクティブ（それ以外）: 白系（選択面 `bg-bg-selected`＋白枠）、ドット無し
 * ステータス値とラベルは ページ マイリスト機能仕様書 §5.2 に準ずる。
 */
import type { ComponentProps } from 'react';
import { cn } from './cn';

export type WatchStatus = 'want_to_watch' | 'watching' | 'completed' | 'on_hold' | 'dropped';

export const WATCH_STATUS_LABEL: Record<WatchStatus, string> = {
  want_to_watch: '見たい',
  watching: '視聴中',
  completed: '完走',
  on_hold: '一時中断',
  dropped: '断念',
};

export const WATCH_STATUS_ORDER: WatchStatus[] = ['want_to_watch', 'watching', 'completed', 'on_hold', 'dropped'];

interface StatusChipProps extends ComponentProps<'button'> {
  status: WatchStatus;
  active?: boolean;
  /** ボタンとしてではなく表示専用にする場合 true（span で描画） */
  readOnly?: boolean;
}

export function StatusChip({ status, active = false, readOnly = false, className, ...rest }: StatusChipProps) {
  const isWatching = active && status === 'watching';
  const classes = cn(
    'inline-flex items-center gap-[6px] rounded-[20px] border px-3 py-[5px] text-md leading-none',
    'transition-[background-color,color,border-color] duration-[120ms]',
    !active && 'border-border-chip bg-bg-input text-text-tertiary hover:text-text-primary hover:border-border-control',
    active && !isWatching && 'border-border-active bg-bg-selected font-semibold text-text-primary',
    isWatching && 'border-brand-watching bg-brand-watching-bg font-semibold text-brand-watching',
    className,
  );
  const content = (
    <>
      {isWatching && <span aria-hidden className="inline-block size-[6px] rounded-full bg-brand-watching" />}
      {WATCH_STATUS_LABEL[status]}
    </>
  );
  if (readOnly) {
    return <span className={classes}>{content}</span>;
  }
  return (
    <button type="button" aria-pressed={active} className={classes} {...rest}>
      {content}
    </button>
  );
}
