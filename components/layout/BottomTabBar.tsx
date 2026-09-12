/**
 * モバイル版ボトムタブバー（共通 uiコンポーネント フロント 仕様書 §2.7、デザイントークン仕様書 §14）。
 * 画面下部に固定し、ホーム／マイリスト／さがす／マイページ の4タブを等幅で並べる。
 * 未ログイン時に「マイページ」を押すとアカウント作成フローへ遷移する。
 * PC（768px以上）・シアターモード中は表示しない。
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { FavoriteIcon, HomeIcon, SearchIcon, UserIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { useLayout } from './LayoutContext';
import { BOTTOM_TABS, activeBottomTab, type BottomTabKey } from './nav';

const ICONS: Record<BottomTabKey, typeof HomeIcon> = {
  home: HomeIcon,
  mylist: FavoriteIcon,
  search: SearchIcon,
  mypage: UserIcon,
};

export function BottomTabBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { compactHeader } = useLayout();
  const active = activeBottomTab(pathname);

  if (compactHeader) return null;

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border-tabs bg-gradient-bottom-tabs pb-[env(safe-area-inset-bottom)] shadow-bottom-tabs md:hidden"
    >
      <ul className="grid h-bottom-tabs grid-cols-4">
        {BOTTOM_TABS.map((tab) => {
          const Icon = ICONS[tab.key];
          const isActive = active === tab.key;
          const href = !user && tab.guestHref ? tab.guestHref : tab.href;
          return (
            <li key={tab.key}>
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-[3px] transition-colors duration-[120ms]',
                  isActive ? 'text-text-primary' : 'text-text-muted',
                )}
              >
                <Icon size={22} strokeWidth={isActive ? 2.25 : 1.75} />
                <span className="text-xs leading-none">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
