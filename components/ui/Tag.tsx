/**
 * タグ（共通 デザイントークン仕様書 v2.0 §7）。
 * クリックで検索・絞り込みにつながる小さなピル（11px）。v1 のテキスト下線形式から変更。
 * カード上で先頭（優先度最上位）のタグは `emphasis` で強調表示する。
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from './cn';

/** 状態ラベルの色（§5.4）。neutral は色なし（従来のグレー）。種類・状態→tone の対応は lib/label-tone-shared.ts */
export type TagTone = 'neutral' | 'success' | 'info' | 'warning' | 'danger';

const TONE_CLASS: Record<Exclude<TagTone, 'neutral'>, string> = {
  success: 'bg-tone-success-bg text-tone-success ring-1 ring-inset ring-tone-success-border',
  info: 'bg-tone-info-bg text-tone-info ring-1 ring-inset ring-tone-info-border',
  warning: 'bg-tone-warning-bg text-tone-warning ring-1 ring-inset ring-tone-warning-border',
  danger: 'bg-tone-danger-bg text-tone-danger ring-1 ring-inset ring-tone-danger-border',
};

/* 枠は ring（内側）で描く。border だと tone 付きだけ高さが2px増え、隣のグレーのラベルと上下がずれるため */
/** Tag を使えない要素（data-testid 付きの span など）に同じ色を当てるためのクラス。neutral は空 */
export function toneClassName(tone: TagTone): string {
  return tone === 'neutral' ? '' : TONE_CLASS[tone];
}

interface TagProps {
  /** 色付きの状態ラベル。指定すると emphasis より優先し、ホバー効果は付けない（表示専用） */
  tone?: TagTone;
  href?: string;
  onClick?: () => void;
  /** 先頭タグの強調表示（§7） */
  emphasis?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * タグピルの寸法・字送りだけを持つ基底クラス（背景色・文字色は含めない）。
 * 「＋ タグを追加」チップ（components/tags/TagRow.tsx）のように配色だけ変えた派生を
 * 作るとき、cn() が単純結合で競合クラスを解決しないため、ここから組み立てる。
 */
export const TAG_BASE_CLASS = 'inline-flex items-center rounded-[4px] px-2 py-[2px] text-sm leading-[1.5] transition-colors duration-[120ms]';
// ホバー効果はクリック可能（href/onClick指定）な場合のみ付ける。読み取り専用表示（例: カード上の
// 先頭ゲームタイトルタグ）にまでホバー効果を付けると、クリックしても何も起きず紛らわしいため
// （2026-09-14、ゲームタイトルカードでのユーザー指摘を受けて修正）
const INTERACTIVE_CLASS = 'hover:bg-white/10 hover:text-text-primary';

export function Tag({ href, onClick, emphasis = false, tone = 'neutral', className, children }: TagProps) {
  const colored = tone !== 'neutral';
  const classes = cn(
    TAG_BASE_CLASS,
    !colored && (href || onClick) && INTERACTIVE_CLASS,
    colored ? TONE_CLASS[tone] : emphasis ? 'bg-bg-selected text-text-primary' : 'bg-bg-hover text-text-secondary',
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(classes, 'border-0')}>
        {children}
      </button>
    );
  }
  return (
    <span className={classes} data-tone={colored ? tone : undefined}>
      {children}
    </span>
  );
}
