import type { Metadata } from 'next';

// お知らせ一覧・詳細（管理 お知らせ管理仕様書 v2.0 §7.3・§7.4）。詳細はページ側でお知らせのタイトルに差し替える
export const metadata: Metadata = { title: '運営からのお知らせ' };

export default function NoticesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
