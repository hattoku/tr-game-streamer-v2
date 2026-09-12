/**
 * 「まとめを探す」（/collections）の準備中ページ。
 * 本実装は document/specification/page/ページ 再生リスト まとめ機能仕様書.md に基づきフェーズ3以降。
 */
import type { Metadata } from 'next';
import { ComingSoon } from '@/components/layout/ComingSoon';

export const metadata: Metadata = { title: 'まとめを探す' };

export default function CollectionsPage() {
  return <ComingSoon title="まとめを探す" />;
}
