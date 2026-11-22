/**
 * 管理画面の骨格（フロントの components/layout/SiteFrame.tsx に相当）。
 * 「共通UIコンポーネント（管理画面）仕様書」がリポジトリに存在しないため、仕様書が定義する
 * 3ペイン構造（ヘッダー＋サイドバー）は採用せず、簡易ヘッダー（ロゴ相当＋ページ内ナビ＋
 * サービスへ戻るリンク＋ユーザーメニュー）＋本文の2段構成で代替する
 * （管理_ダッシュボード仕様書 実装注記参照）。
 * サービス画面との取り違えによる誤操作を防ぐため、ヘッダーはパープルの面＋上端ライン＋「ADMIN」バッジ、
 * アクティブナビもパープルにする（共通 デザイントークン仕様書 §14.1）。
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { MenuIcon, XIcon } from '@/components/ui/icons';
import { UserDropdown } from '@/components/layout/UserDropdown';
import { PageContainer } from '@/components/layout/PageContainer';
import { cn } from '@/components/ui/cn';
import { isActivePath } from '@/components/layout/nav';
import { formatBadgeCount, usePendingWorkflowCount } from './usePendingWorkflowCount';
import { usePendingListingCount } from './usePendingListingCount';

const ADMIN_NAV = [
  { label: 'ダッシュボード', href: '/admin' },
  { label: '審査ワークフロー', href: '/admin/workflows' },
  { label: 'お問い合わせ', href: '/admin/inquiries' },
  { label: 'お知らせ', href: '/admin/notices' },
  { label: 'コンテンツ収集', href: '/admin/collection' },
  { label: 'ユーザー', href: '/admin/users' },
] as const;

function AdminNav({
  pathname,
  pendingCount,
  pendingListing,
  className,
}: {
  pathname: string;
  pendingCount: number;
  pendingListing: number;
  className?: string;
}) {
  return (
    <nav aria-label="管理画面ナビゲーション" className={cn('flex h-full items-center gap-4 md:gap-6', className)}>
      {ADMIN_NAV.map((item) => {
        const active = item.href === '/admin' ? pathname === '/admin' : isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex h-full shrink-0 items-center whitespace-nowrap text-base transition-colors duration-[120ms] hover:text-text-primary',
              active ? 'text-admin-accent-text' : 'text-text-tertiary',
            )}
          >
            {item.label}
            {/* 審査中の件数（共通 uiコンポーネント フロント 仕様書 §2.10） */}
            {item.href === '/admin/workflows' && pendingCount > 0 && (
              <span
                aria-label={`未処理 ${pendingCount} 件`}
                className="ml-[6px] inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-[9px] bg-brand-primary px-[6px] text-sm font-semibold leading-none text-white"
              >
                {formatBadgeCount(pendingCount)}
              </span>
            )}
            {/* 自動掲載の確認待ちの件数（気づかないまま溜めないため。収集候補レビューUI仕様書 §8.2） */}
            {item.href === '/admin/collection' && pendingListing > 0 && (
              <span
                aria-label={`確認待ち ${pendingListing} 件`}
                className="ml-[6px] inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-[9px] bg-brand-primary px-[6px] text-sm font-semibold leading-none text-white"
              >
                {formatBadgeCount(pendingListing)}
              </span>
            )}
            {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-admin-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * モバイル用の管理メニュー（ハンバーガー）。ナビ項目が増えても横スクロールで見切れないよう、
 * 左からスライドインするドロワーに管理画面のページ一覧と「サービスへ戻る」を縦に並べる。
 */
function AdminMobileMenu({ pathname, pendingCount, pendingListing }: { pathname: string; pendingCount: number; pendingListing: number }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const hasPending = pendingCount > 0 || pendingListing > 0;
  const badgeFor = (href: string) => (href === '/admin/workflows' ? pendingCount : href === '/admin/collection' ? pendingListing : 0);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label={hasPending ? '管理メニューを開く（未処理あり）' : '管理メニューを開く'}
        className="relative -ml-2 inline-flex size-10 shrink-0 items-center justify-center rounded-[6px] text-text-secondary transition-colors duration-[120ms] hover:text-text-primary md:hidden"
      >
        <MenuIcon size={22} />
        {hasPending && <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand-primary" />}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <Dialog.Content
          aria-modal="true"
          className="fixed left-0 top-0 z-50 flex h-dvh w-[min(300px,85vw)] flex-col overflow-y-auto border-r border-admin-border bg-admin-header-bg p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-elevated outline-none data-[state=open]:animate-slide-in-left data-[state=closed]:animate-slide-out-left"
        >
          <Dialog.Title className="sr-only">管理メニュー</Dialog.Title>
          <Dialog.Description className="sr-only">管理画面のページ一覧</Dialog.Description>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 whitespace-nowrap text-lg font-semibold text-text-primary">
              管理画面
              <span className="rounded-[4px] bg-admin-accent px-1.5 py-0.5 text-xs font-bold tracking-[0.04em] text-admin-on-accent">ADMIN</span>
            </span>
            <Dialog.Close aria-label="管理メニューを閉じる" className="inline-flex size-10 items-center justify-center rounded-[6px] text-text-muted transition-colors duration-[120ms] hover:text-text-primary">
              <XIcon size={22} />
            </Dialog.Close>
          </div>
          <nav aria-label="管理画面メニュー" className="mt-4">
            <ul>
              {ADMIN_NAV.map((item) => {
                const active = item.href === '/admin' ? pathname === '/admin' : isActivePath(pathname, item.href);
                const count = badgeFor(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={close}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-12 items-center border-l-2 pl-3 text-lg transition-colors duration-[120ms] hover:text-text-primary',
                        active ? 'border-admin-accent text-admin-accent-text' : 'border-transparent text-text-secondary',
                      )}
                    >
                      {item.label}
                      {count > 0 && (
                        <span
                          aria-label={`${item.href === '/admin/collection' ? '確認待ち' : '未処理'} ${count} 件`}
                          className="ml-2 inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-[9px] bg-brand-primary px-[6px] text-sm font-semibold leading-none text-white"
                        >
                          {formatBadgeCount(count)}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="mt-4 border-t border-admin-border pt-2">
            <Link href="/" onClick={close} className="flex h-12 items-center pl-3 text-lg text-text-tertiary transition-colors duration-[120ms] hover:text-text-primary">
              サービスへ戻る
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // 管理画面は管理者しか開けない（app/admin/layout.tsx で判定済み）
  const pendingCount = usePendingWorkflowCount(true);
  const pendingListing = usePendingListingCount(true);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* 上端ラインは inset の影で描き、ヘッダー高さを変えない */}
      <header className="sticky top-0 z-30 border-b border-admin-border bg-admin-header-bg shadow-[inset_0_3px_0_var(--color-admin-accent)]">
        <div className="mx-auto flex h-header-mobile w-full max-w-[1400px] items-center justify-between px-4 md:h-header md:px-6">
          <div className="flex h-full min-w-0 items-center gap-2 md:gap-8">
            <AdminMobileMenu pathname={pathname} pendingCount={pendingCount} pendingListing={pendingListing} />
            <Link href="/admin" className="flex items-center gap-2 whitespace-nowrap text-lg font-semibold text-text-primary">
              管理画面
              <span className="rounded-[4px] bg-admin-accent px-1.5 py-0.5 text-xs font-bold tracking-[0.04em] text-admin-on-accent">
                ADMIN
              </span>
            </Link>
            {/* PCはロゴ横にナビを並べる。モバイルは左端のハンバーガー（AdminMobileMenu）に一覧を出す */}
            <AdminNav pathname={pathname} pendingCount={pendingCount} pendingListing={pendingListing} className="hidden md:flex" />
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <Link href="/" className="hidden whitespace-nowrap text-md text-text-tertiary transition-colors duration-[120ms] hover:text-text-primary md:inline">
              サービスへ戻る
            </Link>
            <UserDropdown />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <PageContainer className="py-6 md:py-8">{children}</PageContainer>
      </main>
    </div>
  );
}
