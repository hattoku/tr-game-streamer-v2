/**
 * モバイル版ボトムタブバー（共通 uiコンポーネント フロント 仕様書 §2.7、デザイントークン仕様書 §14）。
 * 画面下部に固定し、ホーム／マイリスト／さがす／マイページ の4タブを等幅で並べる。
 * 未ログイン時に「マイリスト」「マイページ」を押すと、遷移せずにログイン要求モーダルを出す
 * （何ができるかを伝えてからアカウント作成・ログインへ誘導する。2026-11-17 アカウント作成導線の改善）。
 * PC（768px以上）・シアターモード中は表示しない。
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FavoriteIcon, HomeIcon, SearchIcon, UserIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { useLayout } from './LayoutContext';
import { BOTTOM_TABS, activeBottomTab, type BottomTabKey } from './nav';
import { LoginGateLink } from './LoginGateLink';
import { LOGIN_PROMPTS } from './login-prompts';

const ICONS: Record<BottomTabKey, typeof HomeIcon> = {
  home: HomeIcon,
  mylist: FavoriteIcon,
  search: SearchIcon,
  mypage: UserIcon,
};

export function BottomTabBar() {
  const pathname = usePathname();
  const { headerHidden } = useLayout();
  const active = activeBottomTab(pathname);

  if (headerHidden) return null;

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border-tabs bg-gradient-bottom-tabs pb-[env(safe-area-inset-bottom)] shadow-bottom-tabs md:hidden"
    >
      <ul className="grid h-bottom-tabs grid-cols-4">
        {BOTTOM_TABS.map((tab) => {
          const Icon = ICONS[tab.key];
          const isActive = active === tab.key;
          const className = cn(
            'flex h-full flex-col items-center justify-center gap-[3px] transition-colors duration-[120ms]',
            isActive ? 'text-text-primary' : 'text-text-muted',
          );
          const content = (
            <>
              <Icon size={22} strokeWidth={isActive ? 2.25 : 1.75} />
              <span className="text-xs leading-none">{tab.label}</span>
            </>
          );
          return (
            <li key={tab.key}>
              {/* 未ログインで押したときはログイン要求モーダル。ログイン状態の読み込み中はそのまま遷移する
                  （遷移先のマイページ・マイリストは未ログインならログインページへ移すので行き止まりにはならない） */}
              {tab.guestPrompt ? (
                <LoginGateLink
                  href={tab.href}
                  prompt={LOGIN_PROMPTS[tab.guestPrompt]}
                  aria-current={isActive ? 'page' : undefined}
                  className={className}
                  data-testid={`bottom-tab-${tab.key}`}
                >
                  {content}
                </LoginGateLink>
              ) : (
                <Link href={tab.href} aria-current={isActive ? 'page' : undefined} className={className} data-testid={`bottom-tab-${tab.key}`}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
