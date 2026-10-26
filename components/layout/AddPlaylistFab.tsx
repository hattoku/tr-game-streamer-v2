/**
 * モバイルの「さがす」一覧ページ（/playlists /games /channels /collections）に出す「＋」の浮きボタン。
 * 押すと「再生リストを追加する」（/playlists/new。管理者は登録、一般ユーザーは提案）へ遷移する
 * （ページ 再生リストを追加する 仕様書 §1.4 の導線のモバイル版、フェーズ7ステップ7-4・2026-10-25 ユーザー決定）。
 * 未ログインで押した場合は遷移先で /login へ送られる。PC（768px以上）は各ページの見出しボタン・フッターが担うため出さない。
 * ボトムタブバーの上に置く。stg のテストモードウィジェットが右下を占めるため、テストモード中は左下に置く。
 * 最後の行が隠れないよう、ボタンの高さ分の余白を本文の下に足す（フッターはモバイルで出ないので本文直後に来る）。
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlusIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { TEST_MODE_ENABLED } from '@/lib/app-env';
import { useLayout } from './LayoutContext';
import { isSearchListPage } from './nav';

export function AddPlaylistFab() {
  const pathname = usePathname();
  const { headerHidden } = useLayout();
  if (headerHidden || !isSearchListPage(pathname)) return null;

  return (
    <>
      <div aria-hidden className="h-[72px] md:hidden" />
      <Link
        href="/playlists/new"
        aria-label="再生リストを追加する"
        title="再生リストを追加する"
        className={cn(
          'fixed z-30 inline-flex size-14 items-center justify-center rounded-full bg-gradient-primary text-white shadow-primary inset-shadow-highlight-strong transition-[filter] duration-[120ms] hover:brightness-110 md:hidden',
          'bottom-[calc(var(--spacing-bottom-tabs)+env(safe-area-inset-bottom)+16px)]',
          TEST_MODE_ENABLED ? 'left-[calc(1rem+env(safe-area-inset-left))]' : 'right-[calc(1rem+env(safe-area-inset-right))]',
        )}
      >
        <PlusIcon size={26} strokeWidth={2.25} />
      </Link>
    </>
  );
}
