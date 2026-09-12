/**
 * ルートレイアウト。
 * グローバルCSS（デザイントークン）・認証コンテキスト・トースト通知のプロバイダを全ページに適用する。
 * ヘッダー・フッターはルートグループ (main) のレイアウト、認証ページの簡易レイアウトは (auth) が持つ。
 */
import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../components/ui/Toast';
import { LayoutProvider } from '../components/layout/LayoutContext';
import { TestModeWidget } from '../components/layout/TestModeWidget';

export const metadata: Metadata = {
  title: { default: 'プレミテ', template: '%s | プレミテ' },
  description: 'ゲーム実況動画の再生リスト視聴記録＆新着通知サービス',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AuthProvider>
          <LayoutProvider>
            <ToastProvider>
              {children}
              {/* NEXT_PUBLIC_TEST_MODE=true のビルドでのみ描画される（UI仕様書 §7） */}
              <TestModeWidget />
            </ToastProvider>
          </LayoutProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
