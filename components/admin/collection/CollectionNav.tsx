/**
 * コンテンツ収集の画面切り替え（収集候補／探索対象チャンネル）。管理 AI運営者向け収集候補レビューUI仕様書 v2.2 §1.1。
 * 2つの画面の上に常に出す大きなタブ。マウスオーバーで開くメニューはタッチ端末で使えず、開くまで画面の存在が
 * 見えないため、タブにした。今いる画面は管理用の色（admin-accent）で示す。
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui/cn';

const ITEMS = [
  { href: '/admin/collection', label: '収集候補', description: '見つけた再生リストを承認・却下' },
  { href: '/admin/collection/channels', label: '探索対象チャンネル', description: '探索の起点にするチャンネルを管理' },
] as const;

export function CollectionNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="コンテンツ収集の画面" className="grid grid-cols-2 gap-2">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-w-0 flex-col gap-1 rounded-[10px] border px-4 py-3 transition-colors duration-[120ms]',
              active
                ? 'border-admin-accent bg-admin-accent/15 text-text-primary'
                : 'border-surface-border text-text-tertiary hover:border-admin-border hover:bg-bg-hover hover:text-text-primary',
            )}
          >
            <span className={cn('text-lg font-medium', active && 'text-admin-accent-text')}>{item.label}</span>
            <span className="hidden text-sm text-text-tertiary md:block">{item.description}</span>
          </Link>
        );
      })}
    </nav>
  );
}
