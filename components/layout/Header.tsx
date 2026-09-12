/**
 * グローバルヘッダー（共通 uiコンポーネント フロント 仕様書 §2、デザイントークン仕様書 §14）。
 * - PC（768px以上）: ロゴ／水平ナビ4項目／右端にユーザーエリア（マイリスト・視聴履歴・通知ベル・ユーザー、1段）
 * - モバイル: ハンバーガー（MobileMenu: サポート・法的リンク・©）＋ロゴ＋ユーザーエリア（ログインボタン or
 *   ユーザーアイコン＋名前）。主要導線はボトムタブバー（BottomTabBar）が担い、「さがす」一覧ページの
 *   ときだけ直下にタブ列（SearchTabs）を出す
 * - sticky で最上部に固定。高さ PC 60px・モバイル 52px（＋さがすタブ 52px）・シアターモード時 30px（黒背景）
 * - 面はベース色＋上端ハイライト（トークン仕様書 v2.0 §14）、下線は 1px の半透明白
 * - 通知ベル（ユーザー通知機能仕様書 §4.1）は未読件数付きで PC・モバイル共通（NotificationBell）
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/ui/Logo';
import { LinkButton } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/components/ui/cn';
import { useLayout } from './LayoutContext';
import { MobileMenu } from './MobileMenu';
import { NotificationBell } from './NotificationBell';
import { SearchTabs } from './SearchTabs';
import { UserDropdown } from './UserDropdown';
import { GLOBAL_NAV, SIGNUP_HREF, USER_NAV, isActivePath, isSearchListPage } from './nav';

export function Header() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { compactHeader } = useLayout();
  const showSearchTabs = !compactHeader && isSearchListPage(pathname);

  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-border-divider transition-[background-color] duration-200',
        compactHeader ? 'bg-bg-player' : 'bg-header',
      )}
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 transition-[height] duration-200 md:px-6',
          compactHeader ? 'h-header-compact' : 'h-header-mobile md:h-header',
        )}
      >
        <div className="flex h-full items-center gap-2 md:gap-8">
          {!compactHeader && <MobileMenu className="-ml-2 md:hidden" />}
          <Logo compact={compactHeader} />
          <nav aria-label="グローバルナビゲーション" className="hidden h-full items-center gap-6 md:flex">
            {GLOBAL_NAV.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex h-full items-center text-base transition-colors duration-[120ms] hover:text-text-primary',
                    active ? 'text-text-primary' : 'text-text-tertiary',
                  )}
                >
                  {item.label}
                  {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-text-primary" />}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3 md:gap-5">
          {loading ? (
            <Skeleton className="h-7 w-20 md:w-[140px]" />
          ) : user ? (
            <>
              {/* PC のみ: マイリスト／視聴履歴。表示切替はラッパー要素で行う */}
              <div className="hidden items-center gap-5 md:flex">
                {USER_NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActivePath(pathname, item.href) ? 'page' : undefined}
                    className={cn(
                      'text-base transition-colors duration-[120ms] hover:text-text-primary',
                      isActivePath(pathname, item.href) ? 'text-text-primary' : 'text-text-tertiary',
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              {/* 通知ベル（未読件数付き）は PC・モバイル共通。通知一覧への唯一の導線 */}
              <NotificationBell compact={compactHeader} />
              <UserDropdown compact={compactHeader} />
            </>
          ) : (
            <>
              {/* PC: ログイン（文字リンク・従）＋ アカウント作成（プライマリ・主）。§2.5 */}
              <div className="hidden items-center gap-5 md:flex">
                <Link href="/login" className="text-base text-text-secondary transition-colors duration-[120ms] hover:text-text-primary">
                  ログイン
                </Link>
                <LinkButton href={SIGNUP_HREF} variant="primary" size="sm">
                  アカウント作成
                </LinkButton>
              </div>
              {/* モバイル: ログイン1つだけ（セカンダリ小型）。アカウント作成はボトムタブ「マイページ」が担う。§2.7
                  表示切替はラッパー要素で行う（ボタン自身に hidden を付けると内部の inline-flex に負けて隠れない） */}
              <div className="md:hidden">
                <LinkButton href="/login" variant="secondary" size="sm">
                  ログイン
                </LinkButton>
              </div>
            </>
          )}
        </div>
      </div>

      {showSearchTabs && <SearchTabs className="md:hidden" />}
    </header>
  );
}
