/**
 * ボタン（共通 デザイントークン仕様書 v2.0 §4・§11・§16）。
 * - primary:   ページ内で最も重要な1アクション（§4.1）。ブランド赤の面＋影。1ページに原則1つ
 * - secondary: 操作系（§4.2）。グレーの面＋1px枠＋影。`active` でトグルON状態（逆順で再生・連続再生など）
 * - ghost:     従アクション（§4.4）。面を持たず、ホバーで面が現れる（削除・キャンセル）
 * - rakuten:   外部リンク（楽天ブックス、§4.3）
 * size 'full' は幅100%のアクション系、'sm' はヘッダーの「アカウント作成」など小型（§14）。
 * リンクとして使う場合は LinkButton を使う。
 */
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'rakuten';
export type ButtonSize = 'md' | 'sm' | 'full';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-primary text-white font-semibold border-0 shadow-primary inset-shadow-highlight-strong ' +
    'hover:brightness-[1.08] hover:-translate-y-px',
  secondary:
    'bg-gradient-secondary text-text-btn font-medium border border-border-control shadow-control inset-shadow-highlight ' +
    'hover:bg-gradient-secondary-hover',
  ghost: 'bg-transparent text-text-muted font-normal border border-transparent hover:text-text-primary hover:bg-bg-hover',
  rakuten: 'bg-brand-rakuten text-white font-medium border-0 hover:brightness-110',
};

/** トグルON状態（§4.2）。secondary にのみ適用する */
const ACTIVE = 'bg-none bg-bg-selected text-text-primary border-border-active hover:bg-none';

const SIZE: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: {
    md: 'text-lg px-[22px] py-[9px] rounded-[8px]',
    sm: 'text-base px-[14px] py-[7px] rounded-[8px]',
    full: 'text-lg w-full px-[22px] py-[11px] rounded-[8px]',
  },
  secondary: {
    md: 'text-base px-[14px] py-2 rounded-[8px]',
    sm: 'text-md px-[10px] py-[5px] rounded-[6px]',
    full: 'text-base w-full p-[10px] rounded-[8px]',
  },
  ghost: {
    md: 'text-base px-3 py-2 rounded-[8px]',
    sm: 'text-md px-[8px] py-[5px] rounded-[6px]',
    full: 'text-base w-full p-[10px] rounded-[8px]',
  },
  rakuten: {
    md: 'text-md px-3 py-[6px] rounded-[6px]',
    sm: 'text-sm px-[10px] py-1 rounded-[6px]',
    full: 'text-md w-full px-3 py-2 rounded-[6px]',
  },
};

const BASE =
  'inline-flex items-center justify-center gap-[6px] whitespace-nowrap select-none ' +
  'transition-[background-color,color,border-color,transform,box-shadow,filter] duration-[120ms]';

export function buttonClassName(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  className?: string,
  active = false,
) {
  return cn(BASE, VARIANT[variant], SIZE[variant][size], active && variant === 'secondary' && ACTIVE, className);
}

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** true の間はスピナーを表示し、クリックを無効化する（§9.3 ボタン内アクション実行中） */
  loading?: boolean;
  /** トグルON状態（secondary のみ）。aria-pressed も付く */
  active?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  active = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-pressed={variant === 'secondary' && active ? true : rest['aria-pressed']}
      className={buttonClassName(variant, size, className, active)}
      {...rest}
    >
      {loading && <Spinner size={14} className={variant === 'primary' ? 'text-white' : undefined} />}
      {children}
    </button>
  );
}

interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function LinkButton({ variant = 'secondary', size = 'md', className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={buttonClassName(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

interface ExternalLinkButtonProps extends ComponentProps<'a'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

/** 外部サイトへのリンク（新しいタブで開く） */
export function ExternalLinkButton({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ExternalLinkButtonProps) {
  return (
    <a target="_blank" rel="noopener noreferrer" className={buttonClassName(variant, size, className)} {...rest}>
      {children}
    </a>
  );
}
