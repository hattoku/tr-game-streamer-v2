/**
 * モバイル「さがす」セクションのタブ列（共通 uiコンポーネント フロント 仕様書 §2.7、
 * デザイントークン仕様書 §14）。
 * /playlists /games /channels（まとめを出す間は /collections も）の一覧ページでヘッダー直下に表示する。
 * 横幅に収めるためタブ数で等分した固定幅とし（v2.0 でまとめを外して3タブ）、ラベルは2行（上段: 対象「再生リスト」等を大きめ、
 * 下段: 「を探す」「から探す」を小さく）。横スクロールはしない。
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui/cn';
import { SEARCH_TABS } from './nav';

export function SearchTabs({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="さがす"
      style={{ gridTemplateColumns: `repeat(${SEARCH_TABS.length}, minmax(0, 1fr))` }}
      className={cn('grid h-header-mobile-tabs border-t border-border-divider', className)}
    >
      {SEARCH_TABS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            aria-label={`${item.main}${item.sub}`}
            className={cn(
              'relative flex flex-col items-center justify-center gap-[2px] px-0.5 whitespace-nowrap transition-colors duration-[120ms] hover:text-text-primary',
              active ? 'text-text-primary' : 'text-text-tertiary',
            )}
          >
            <span className="text-md font-medium leading-none">{item.main}</span>
            <span className={cn('text-xs leading-none', active ? 'text-text-secondary' : 'text-text-muted')}>{item.sub}</span>
            {active && <span aria-hidden className="absolute inset-x-2 bottom-0 h-[2px] bg-text-primary" />}
          </Link>
        );
      })}
    </nav>
  );
}
