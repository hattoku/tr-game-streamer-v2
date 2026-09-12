/**
 * 認証ページ（/login 等）のレイアウト。ロゴのみの簡易ヘッダー、フッター無し
 * （ログイン仕様書 §12.1）。
 */
import { AuthLayout } from '@/components/layout/AuthLayout';

export default function AuthGroupLayout({ children }: { children: React.ReactNode }) {
  return <AuthLayout>{children}</AuthLayout>;
}
