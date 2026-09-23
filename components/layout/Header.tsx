/**
 * グローバルヘッダー（共通 uiコンポーネント フロント 仕様書 §2、デザイントークン仕様書 §14）。
 * - PC（768px以上）: ロゴ／水平ナビ4項目／右端にユーザーエリア（マイリスト・視聴履歴・通知ベル・ユーザー、1段）
 * - モバイル: ハンバーガー（MobileMenu: サポート・法的リンク・©）＋ロゴ＋ユーザーエリア（ログインボタン or
 *   ユーザーアイコン＋名前）。主要導線はボトムタブバー（BottomTabBar）が担い、「さがす」一覧ページの
 *   ときだけ直下にタブ列（SearchTabs）を出す
 * - sticky で最上部に固定した上で、下スクロール中は画面外へスライドして隠し、上スクロールで即座に
 *   再表示する（常時表示だとコンテンツの可視領域を圧迫するため。§2.8）
 * - 面はベース色＋上端ハイライト（トークン仕様書 v2.0 §14）、下線は 1px の半透明白
 * - 通知ベル（ユーザー通知機能仕様書 §4.1）は未読件数付きで PC・モバイル共通（NotificationBell）
 * - シアターモード中はヘッダーごと非表示にする（プレーヤーを画面最上部に出すため。動画プレーヤー仕様書
 *   「シアターモード」）。LayoutContext の headerHidden で制御し、再生リスト詳細ページ側が管理する
 */
'use client';

import { useEffect, useRef, useState } from 'react';
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

/** これ未満のスクロール量では隠さない（ページ最上部付近でのチラつき防止） */
const AUTO_HIDE_THRESHOLD = 96;

export function Header() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { headerHidden } = useLayout();
  const showSearchTabs = !headerHidden && isSearchListPage(pathname);

  const [scrolledOut, setScrolledOut] = useState(false);
  const lastScrollYRef = useRef(0);

  // ページ遷移直後・シアターモード解除直後は必ず表示状態から始める（effect ではなくレンダー中に同期させる。
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes）。
  // headerHidden が true の間はスクロール監視を止めるため（下の effect）、その間にスクロールされていると
  // scrolledOut が古い値のまま残る。解除時にリセットしないとヘッダーが隠れたまま出てこなくなる
  const [trackedKey, setTrackedKey] = useState(`${pathname}:${headerHidden}`);
  const currentKey = `${pathname}:${headerHidden}`;
  if (currentKey !== trackedKey) {
    setTrackedKey(currentKey);
    if (!headerHidden) setScrolledOut(false);
  }

  useEffect(() => {
    if (headerHidden) return;
    lastScrollYRef.current = window.scrollY;
    let ticking = false;

    function handleScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < AUTO_HIDE_THRESHOLD) {
          setScrolledOut(false);
        } else {
          setScrolledOut(y > lastScrollYRef.current);
        }
        lastScrollYRef.current = y;
        ticking = false;
      });
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [headerHidden]);

  if (headerHidden) return null;

  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-border-divider bg-header transition-transform duration-200',
        scrolledOut && '-translate-y-full',
      )}
    >
      <div className="mx-auto flex h-header-mobile w-full max-w-[1400px] items-center justify-between px-4 md:h-header md:px-6">
        <div className="flex h-full min-w-0 items-center gap-2 md:gap-6 lg:gap-8">
          <MobileMenu className="-ml-2 md:hidden" />
          <Logo />
          <nav aria-label="グローバルナビゲーション" className="hidden h-full items-center gap-4 md:flex lg:gap-6">
            {GLOBAL_NAV.map((item) => {
              const active = isActivePath(pathname, item.href);
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
        </div>

        <div className="flex shrink-0 items-center gap-3 md:gap-4 lg:gap-5">
          {loading ? (
            <Skeleton className="h-7 w-20 md:w-[140px]" />
          ) : user ? (
            <>
              {/* PC のみ: マイリスト／視聴履歴。表示切替はラッパー要素で行う。
                  768〜1023px ではヘッダーに全要素が収まらないため非表示にし、ユーザードロップダウンの項目で代替する（UI仕様書 §2.9） */}
              <div className="hidden items-center gap-5 lg:flex">
                {USER_NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActivePath(pathname, item.href) ? 'page' : undefined}
                    className={cn(
                      'whitespace-nowrap text-base transition-colors duration-[120ms] hover:text-text-primary',
                      isActivePath(pathname, item.href) ? 'text-text-primary' : 'text-text-tertiary',
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              {/* 通知ベル（未読件数付き）は PC・モバイル共通。通知一覧への唯一の導線 */}
              <NotificationBell />
              <UserDropdown />
            </>
          ) : (
            <>
              {/* PC: ログイン（文字リンク・従）＋ アカウント作成（プライマリ・主）。§2.5 */}
              <div className="hidden items-center gap-5 md:flex">
                <Link href="/login" className="whitespace-nowrap text-base text-text-secondary transition-colors duration-[120ms] hover:text-text-primary">
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
