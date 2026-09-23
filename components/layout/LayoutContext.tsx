/**
 * レイアウト状態のコンテキスト。
 * シアターモード中はヘッダー（＋モバイルのボトムタブバー）を完全に非表示にする
 * （動画プレーヤー仕様書「シアターモード」）ことを、再生リスト詳細ページからヘッダー側へ伝えるためだけに使う。
 * シアターモードはページを離れるとリセットされる仕様のため、ページ側で unmount 時に false に戻すこと。
 */
'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface LayoutContextValue {
  headerHidden: boolean;
  setHeaderHidden: (value: boolean) => void;
}

const LayoutContext = createContext<LayoutContextValue>({
  headerHidden: false,
  setHeaderHidden: () => {},
});

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [headerHidden, setHeaderHidden] = useState(false);
  const value = useMemo(() => ({ headerHidden, setHeaderHidden }), [headerHidden]);
  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout() {
  return useContext(LayoutContext);
}
