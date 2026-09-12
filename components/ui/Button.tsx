/**
 * ボタン（共通 デザイントークン仕様書 §4・§11）。
 * - primary:   ページ内で最も重要な1アクション（§4.1）。1ページに原則1つ
 * - secondary: 操作系（§4.2）
 * - rakuten:   外部リンク（楽天ブックス、§4.3）
 * size 'full' は幅100%のアクション系（§4.2 パディング 10px）、'sm' はヘッダーの
 * 「アカウント作成」など小型（§14）。
 * リンクとして使う場合は LinkButton を使う。
 */
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'rakuten';
export type ButtonSize = 'md' | 'sm' | 'full';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-text-primary text-text-on-primary hover:bg-btn-primary-hover border-0',
  secondary:
    'bg-bg-btn text-text-btn border-[0.5px] border-border-strong hover:bg-btn-secondary-hover',
  rakuten: 'bg-brand-rakuten text-white border-0 hover:brightness-110',
};

const SIZE: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: {
    md: 'text-lg px-[22px] py-[9px] rounded-[7px]',
    sm: 'text-base px-[14px] py-[7px] rounded-[7px]',
    full: 'text-lg w-full px-[22px] py-[10px] rounded-[7px]',
  },
  secondary: {
    md: 'text-base px-[14px] py-2 rounded-[7px]',
    sm: 'text-md px-[10px] py-[5px] rounded-[6px]',
    full: 'text-base w-full p-[10px] rounded-[7px]',
  },
  rakuten: {
    md: 'text-md px-3 py-[6px] rounded-[6px]',
    sm: 'text-sm px-[10px] py-1 rounded-[6px]',
    full: 'text-md w-full px-3 py-2 rounded-[6px]',
  },
};

const BASE =
  'inline-flex items-center justify-center gap-[6px] font-medium whitespace-nowrap select-none ' +
  'transition-[background-color,color,border-color] duration-[120ms]';

export function buttonClassName(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) {
  return cn(BASE, VARIANT[variant], SIZE[variant][size], className);
}

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** true の間はスピナーを表示し、クリックを無効化する（§9.3 ボタン内アクション実行中） */
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
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
      className={buttonClassName(variant, size, className)}
      {...rest}
    >
      {loading && <Spinner size={14} className={variant === 'primary' ? 'text-text-on-primary' : undefined} />}
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
