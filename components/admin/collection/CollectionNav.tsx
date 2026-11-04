/**
 * コンテンツ収集の画面切り替え（自動掲載の確認／掲載チャンネル／ゲーム未設定）。管理 AI運営者向け収集候補レビューUI仕様書 v2.2 §1.1。
 * 2つの画面の上に常に出す大きなタブ。マウスオーバーで開くメニューはタッチ端末で使えず、開くまで画面の存在が
 * 見えないため、タブにした。今いる画面は管理用の色（admin-accent）で示す。
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui/cn';
import { formatBadgeCount } from '@/components/admin/usePendingWorkflowCount';
import { usePendingListingCount } from '@/components/admin/usePendingListingCount';

const ITEMS = [
  { href: '/admin/collection', label: '自動掲載の確認', description: '取り込んだ再生リストを確認して掲載' },
  { href: '/admin/collection/channels', label: '掲載チャンネル', description: '掲載するチャンネルと掲載方法を管理' },
  { href: '/admin/collection/unset', label: 'ゲーム未設定', description: 'ゲームが決まっていない再生リストに付ける' },
] as const;

export function CollectionNav() {
  const pathname = usePathname();
  const pendingListing = usePendingListingCount(true);
  return (
    <nav aria-label="コンテンツ収集の画面" className="grid grid-cols-3 gap-2">
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
            <span className={cn('flex items-center gap-2 text-lg font-medium', active && 'text-admin-accent-text')}>
              {item.label}
              {item.href === '/admin/collection' && pendingListing > 0 && (
                <span aria-label={`確認待ち ${pendingListing} 件`} className="inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-[9px] bg-brand-primary px-[6px] text-sm font-semibold leading-none text-white">
                  {formatBadgeCount(pendingListing)}
                </span>
              )}
            </span>
            <span className="hidden text-sm text-text-tertiary md:block">{item.description}</span>
          </Link>
        );
      })}
    </nav>
  );
}
