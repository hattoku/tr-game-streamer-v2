/**
 * 認証フロー用の簡易レイアウト（共通 uiコンポーネント フロント 仕様書 §1 適用範囲、
 * ログイン仕様書 §12.1: ヘッダーはロゴのみ、フッター無し）。
 * /login /signup /password-reset で使う。
 */
import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/Logo';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-header-mobile items-center border-b-[0.5px] border-border-subtle px-4 md:h-header md:px-6">
        <Logo />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-10 md:py-16">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}
