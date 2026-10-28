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
import { UserDropdown } from '@/components/layout/UserDropdown';
import { PageContainer } from '@/components/layout/PageContainer';
import { cn } from '@/components/ui/cn';
import { isActivePath } from '@/components/layout/nav';
import { formatBadgeCount, usePendingWorkflowCount } from './usePendingWorkflowCount';

const ADMIN_NAV = [
  { label: 'ダッシュボード', href: '/admin' },
  { label: '審査ワークフロー', href: '/admin/workflows' },
  { label: 'お問い合わせ', href: '/admin/inquiries' },
  { label: 'コンテンツ収集', href: '/admin/collection' },
] as const;

function AdminNav({ pathname, pendingCount, className }: { pathname: string; pendingCount: number; className?: string }) {
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
            {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-admin-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // 管理画面は管理者しか開けない（app/admin/layout.tsx で判定済み）
  const pendingCount = usePendingWorkflowCount(true);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* 上端ラインは inset の影で描き、ヘッダー高さを変えない */}
      <header className="sticky top-0 z-30 border-b border-admin-border bg-admin-header-bg shadow-[inset_0_3px_0_var(--color-admin-accent)]">
        <div className="mx-auto flex h-header-mobile w-full max-w-[1400px] items-center justify-between px-4 md:h-header md:px-6">
          <div className="flex h-full min-w-0 items-center gap-4 md:gap-8">
            <Link href="/admin" className="flex items-center gap-2 whitespace-nowrap text-lg font-semibold text-text-primary">
              管理画面
              <span className="rounded-[4px] bg-admin-accent px-1.5 py-0.5 text-xs font-bold tracking-[0.04em] text-admin-on-accent">
                ADMIN
              </span>
            </Link>
            {/* PCはロゴ横にナビを並べる。モバイルはヘッダー下の2段目（下記）に折り返す
                （ナビ項目・ユーザー名の長さに関わらず390px幅で詰まらないようにするため） */}
            <AdminNav pathname={pathname} pendingCount={pendingCount} className="hidden md:flex" />
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <Link href="/" className="hidden whitespace-nowrap text-md text-text-tertiary transition-colors duration-[120ms] hover:text-text-primary md:inline">
              サービスへ戻る
            </Link>
            <UserDropdown />
          </div>
        </div>
        <div className="border-t border-admin-border md:hidden">
          <PageContainer>
            {/* 項目が増えても390px幅で画面全体が横に広がらないよう、ナビの中だけ横スクロールにする */}
            <AdminNav pathname={pathname} pendingCount={pendingCount} className="h-11 overflow-x-auto" />
          </PageContainer>
        </div>
      </header>
      <main className="flex-1">
        <PageContainer className="py-6 md:py-8">{children}</PageContainer>
      </main>
    </div>
  );
}
