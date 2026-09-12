/**
 * フロント通常ページの骨格: ヘッダー／メイン（コンテンツエリア）／フッター／ボトムタブバー（モバイル）。
 * (main) ルートグループのレイアウトと、ルート直下の not-found / error ページから使う
 * （共通 エラーページ 仕様書 §2.5: 404/500 はヘッダー・フッターを通常表示）。
 * モバイルではボトムタブバーに本文・フッターが隠れないよう下端に余白を取る（UI仕様書 §2.7）。
 */
import type { ReactNode } from 'react';
import { BottomTabBar } from './BottomTabBar';
import { Footer } from './Footer';
import { Header } from './Header';
import { PageContainer } from './PageContainer';

export function SiteFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pb-[calc(var(--spacing-bottom-tabs)+env(safe-area-inset-bottom))] md:pb-0">
      <Header />
      <main className="flex-1">
        <PageContainer className="py-6 md:py-8">{children}</PageContainer>
      </main>
      <Footer />
      <BottomTabBar />
    </div>
  );
}
