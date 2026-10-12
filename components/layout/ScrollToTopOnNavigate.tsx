/**
 * 別ページへの遷移時にページ先頭へスクロールする。
 * Next.js の <Link> は「遷移先の Page 要素が画面内に見えていればスクロール位置を保つ」のが既定のため、
 * 長いページの下の方から短いページ（まとめ詳細など）へ移ると、前のスクロール位置のまま最下部付近に着地してしまう
 * （2026-10-12、プロフィール→まとめ詳細でユーザー指摘）。パス名が変わったときだけ先頭へ戻し、
 * 戻る/進む（popstate）はブラウザ・Next.js のスクロール復元に任せる。クエリだけの変更（絞り込み・タブ等）とハッシュ付き遷移は対象外。
 */
'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export function ScrollToTopOnNavigate() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);
  const isHistoryNavigation = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      isHistoryNavigation.current = true;
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (isHistoryNavigation.current) {
      isHistoryNavigation.current = false;
      return;
    }
    if (!window.location.hash) window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
