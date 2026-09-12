/**
 * タグ（共通 デザイントークン仕様書 §7）。
 * クリックで検索・絞り込みにつながるテキストリンク形式。ボタン型は使わない。
 * ゲーム情報内のタグは size="sm"（11px）。
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from './cn';

interface TagProps {
  href?: string;
  onClick?: () => void;
  size?: 'md' | 'sm';
  className?: string;
  children: ReactNode;
}

const TAG_CLASS =
  'text-text-tertiary underline decoration-[#555555] underline-offset-[3px] hover:text-text-primary transition-colors duration-[120ms]';

export function Tag({ href, onClick, size = 'md', className, children }: TagProps) {
  const classes = cn(TAG_CLASS, size === 'sm' ? 'text-sm' : 'text-md', className);
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cn(classes, 'bg-transparent border-0 p-0')}>
      {children}
    </button>
  );
}
