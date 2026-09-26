/**
 * ルートレイアウト。
 * グローバルCSS（デザイントークン）・認証コンテキスト・トースト通知のプロバイダを全ページに適用する。
 * ヘッダー・フッターはルートグループ (main) のレイアウト、認証ページの簡易レイアウトは (auth) が持つ。
 */
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { APP_DISPLAY_NAME } from '../lib/app-env';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../components/ui/Toast';
import { LayoutProvider } from '../components/layout/LayoutContext';
import { TestModeWidget } from '../components/layout/TestModeWidget';

export const metadata: Metadata = {
  title: { default: 'プレミテ', template: '%s | プレミテ' },
  description: 'ゲーム実況動画の再生リスト視聴記録＆新着通知サービス',
  // 検証段階のため本番含め全ページを検索エンジンから除外する（app/robots.tsのDisallow: /と対）。
  // 正式公開時に外すこと。
  robots: { index: false, follow: false },
  // iOSでホーム画面に追加したときの設定（技術スタック仕様書 §2.10。manifest は app/manifest.ts）。
  // statusBarStyle を black-translucent にするとヘッダーがステータスバーの裏に潜り、
  // safe-area 対応が別途必要になるため black にしている。
  appleWebApp: { capable: true, title: APP_DISPLAY_NAME, statusBarStyle: 'black' },
};

// ブラウザUI・PWAのタイトルバー色。デザイントークン --color-bg-base と揃える
export const viewport: Viewport = {
  themeColor: '#0f0f0f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      {/* suppressHydrationWarning: ブラウザ拡張（ColorZilla の cz-shortcut-listen 等）が body に属性を
          差し込むと React がハイドレーション不一致の警告を出す。body 自身の属性差分だけを抑止する
          （子要素の不一致は引き続き検出される） */}
      <body suppressHydrationWarning>
        <AuthProvider>
          <LayoutProvider>
            <ToastProvider>
              {children}
              {/* NEXT_PUBLIC_TEST_MODE=true かつ本番以外のビルドでのみ描画される（UI仕様書 §7、lib/app-env.ts） */}
              <TestModeWidget />
            </ToastProvider>
          </LayoutProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
