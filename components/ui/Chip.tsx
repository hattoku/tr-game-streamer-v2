/**
 * 視聴ステータスチップ（共通 デザイントークン仕様書 v2.0 §5.1）。
 * - 非アクティブ: グレー（1px の半透明白の枠）
 * - アクティブ（視聴中）: シアングリーン＋左端ドット 6px。刺し色はこの状態のみ
 * - アクティブ（それ以外）: 白系（選択面 `bg-bg-selected`＋白枠）、ドット無し
 * ステータス値とラベルは ページ マイリスト機能仕様書 §5.2 に準ずる。
 * `mylist.watchStatus` / `reviews.watchStatus` の共通語彙（Firestore データモデル設計書
 * 3.9・3.11節）。`mylist.watchStatus` を正とし、レビュー側は表示用の非正規化コピー
 * （ページ 再生リスト レビュー投稿機能 仕様書「視聴ステータス」節）。
 */
import type { ComponentProps, ReactNode } from 'react';
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

/** 主要3ステータス（マイリストページのフィルタタブ・レビュー投稿UIで表に出す） */
export const WATCH_STATUS_PRIMARY: WatchStatus[] = ['want_to_watch', 'watching', 'completed'];
/** 「その他」グループ（ドロップダウンに格納） */
export const WATCH_STATUS_OTHER: WatchStatus[] = ['on_hold', 'dropped'];

const WATCH_STATUS_VALUES = new Set<string>(WATCH_STATUS_ORDER);

/**
 * 不正値・廃止値を安全な WatchStatus に丸める。
 * 旧 `reviews.watchStatus` の "reviewing"（レビュー投稿機能仕様書 v1.3.0 以前）は
 * 視聴ステータスとして扱えないため、実質的に視聴完了とみなして "completed" に寄せる。
 */
export function normalizeWatchStatus(value: unknown): WatchStatus | null {
  if (value === 'reviewing') return 'completed';
  if (typeof value === 'string' && WATCH_STATUS_VALUES.has(value)) return value as WatchStatus;
  return null;
}

/** チップの見た目のクラスだけを返す（Radix asChild のトリガー等、生の要素に直接当てたい場合用） */
export function chipClassName(active = false, tone: 'neutral' | 'watching' = 'neutral', className?: string) {
  const isWatching = active && tone === 'watching';
  return cn(
    'inline-flex items-center gap-[6px] rounded-[20px] border px-3 py-[5px] text-md leading-none',
    'transition-[background-color,color,border-color] duration-[120ms]',
    !active && 'border-border-chip bg-bg-input text-text-tertiary hover:text-text-primary hover:border-border-control',
    active && !isWatching && 'border-border-active bg-bg-selected font-semibold text-text-primary',
    isWatching && 'border-brand-watching bg-brand-watching-bg font-semibold text-brand-watching',
    className,
  );
}

interface ChipProps extends ComponentProps<'button'> {
  active?: boolean;
  /** アクティブ時の刺し色を変える。"watching" のみシアングリーン＋ドット（§5.1） */
  tone?: 'neutral' | 'watching';
  /** ボタンとしてではなく表示専用にする場合 true（span で描画） */
  readOnly?: boolean;
  children: ReactNode;
}

/** ステータスチップの見た目の土台。個別の状態値を持たない汎用チップ（「その他▼」トリガー等）にも使う */
export function Chip({ active = false, tone = 'neutral', readOnly = false, className, children, ...rest }: ChipProps) {
  const isWatching = active && tone === 'watching';
  const classes = chipClassName(active, tone, className);
  const content = (
    <>
      {isWatching && <span aria-hidden className="inline-block size-[6px] rounded-full bg-brand-watching" />}
      {children}
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

interface StatusChipProps extends Omit<ComponentProps<'button'>, 'children'> {
  status: WatchStatus;
  active?: boolean;
  readOnly?: boolean;
}

export function StatusChip({ status, active = false, readOnly = false, className, ...rest }: StatusChipProps) {
  return (
    <Chip active={active} tone={status === 'watching' ? 'watching' : 'neutral'} readOnly={readOnly} className={className} {...rest}>
      {WATCH_STATUS_LABEL[status]}
    </Chip>
  );
}
