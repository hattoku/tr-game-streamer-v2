/**
 * まとめのページ（/collections 配下）のレイアウト。
 * まとめ機能の取り下げ（2026-11-01、ページ一覧仕様書 v2.0・まとめ機能仕様書 v2.0）で COLLECTIONS_ENABLED が false の間は
 * 配下のページをすべて 404 にする（共通 エラーページ 仕様書）。ページのコードは戻せるように残してある。
 */
import { notFound } from 'next/navigation';
import { COLLECTIONS_ENABLED } from '@/lib/feature-flags';

export default function CollectionsLayout({ children }: { children: React.ReactNode }) {
  if (!COLLECTIONS_ENABLED) notFound();
  return children;
}
