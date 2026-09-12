/**
 * フロント通常ページ（TOP・探す系・再生リスト詳細・マイページ系）のレイアウト。
 * ヘッダー・フッター付き（共通 uiコンポーネント フロント 仕様書 §1 適用範囲）。
 * 認証ページは (auth) グループの別レイアウトを使う。
 */
import { SiteFrame } from '@/components/layout/SiteFrame';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
