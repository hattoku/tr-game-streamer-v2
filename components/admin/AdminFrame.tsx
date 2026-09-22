/**
 * 管理画面の骨格（フロントの components/layout/SiteFrame.tsx に相当）。
 * 「共通UIコンポーネント（管理画面）仕様書」がリポジトリに存在しないため、仕様書が定義する
 * 3ペイン構造（ヘッダー＋サイドバー）は採用せず、簡易ヘッダー（ロゴ相当＋ページ内ナビ＋
 * サービスへ戻るリンク＋ユーザーメニュー）＋本文の2段構成で代替する
 * （管理_ダッシュボード仕様書 実装注記参照）。
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserDropdown } from '@/components/layout/UserDropdown';
import { PageContainer } from '@/components/layout/PageContainer';
import { cn } from '@/components/ui/cn';
import { isActivePath } from '@/components/layout/nav';

const ADMIN_NAV = [
  { label: 'ダッシュボード', href: '/admin' },
  { label: '審査ワークフロー', href: '/admin/workflows' },
] as const;

function AdminNav({ pathname, className }: { pathname: string; className?: string }) {
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
              'relative flex h-full items-center whitespace-nowrap text-base transition-colors duration-[120ms] hover:text-text-primary',
              active ? 'text-text-primary' : 'text-text-tertiary',
            )}
          >
            {item.label}
            {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-text-primary" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border-divider bg-header">
        <div className="mx-auto flex h-header-mobile w-full max-w-[1400px] items-center justify-between px-4 md:h-header md:px-6">
          <div className="flex h-full min-w-0 items-center gap-4 md:gap-8">
            <Link href="/admin" className="whitespace-nowrap text-lg font-semibold text-text-primary">
              管理画面
            </Link>
            {/* PCはロゴ横にナビを並べる。モバイルはヘッダー下の2段目（下記）に折り返す
                （ナビ項目・ユーザー名の長さに関わらず390px幅で詰まらないようにするため） */}
            <AdminNav pathname={pathname} className="hidden md:flex" />
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <Link href="/" className="hidden whitespace-nowrap text-md text-text-tertiary transition-colors duration-[120ms] hover:text-text-primary md:inline">
              サービスへ戻る
            </Link>
            <UserDropdown compact />
          </div>
        </div>
        <div className="border-t border-border-divider md:hidden">
          <PageContainer>
            <AdminNav pathname={pathname} className="h-11" />
          </PageContainer>
        </div>
      </header>
      <main className="flex-1">
        <PageContainer className="py-6 md:py-8">{children}</PageContainer>
      </main>
    </div>
  );
}
