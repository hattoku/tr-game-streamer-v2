/**
 * 画面幅がモバイル（767px以下。共通 uiコンポーネント フロント 仕様書 §2.9）かどうか。
 * CSS の `md:` と同じ境目。サーバー描画と最初の描画は false（PC 扱い）で、ブラウザで幅が分かってから切り替わる。
 * メニュー項目のように「display:none で隠すとキーボード操作で迷子になる」要素を出し分けるときに使う。
 */
'use client';

import { useSyncExternalStore } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}
