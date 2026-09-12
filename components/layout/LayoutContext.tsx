/**
 * レイアウト状態のコンテキスト。
 * 現状はシアターモード時のヘッダー縮小（動画プレーヤー仕様書「シアターモード」:
 * ヘッダー高さ 60px → 30px・黒背景）を再生リスト詳細ページからヘッダーへ伝えるためだけに使う。
 * シアターモードはページを離れるとリセットされる仕様のため、ページ側で unmount 時に false に戻すこと。
 */
'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface LayoutContextValue {
  compactHeader: boolean;
  setCompactHeader: (value: boolean) => void;
}

const LayoutContext = createContext<LayoutContextValue>({
  compactHeader: false,
  setCompactHeader: () => {},
});

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [compactHeader, setCompactHeader] = useState(false);
  const value = useMemo(() => ({ compactHeader, setCompactHeader }), [compactHeader]);
  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout() {
  return useContext(LayoutContext);
}
