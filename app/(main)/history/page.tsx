/**
 * 「視聴履歴」（/history）の準備中ページ。
 * 本実装は document/specification/page/ページ 視聴履歴 仕様書.md に基づきフェーズ3以降。
 * モバイルのボトムタブ「マイページ」の暫定の遷移先（UIコンポーネント仕様書 §2.7）でもあるため、404 にせず準備中で受ける。
 */
import type { Metadata } from 'next';
import { ComingSoon } from '@/components/layout/ComingSoon';

export const metadata: Metadata = { title: '視聴履歴' };

export default function HistoryPage() {
  return <ComingSoon title="視聴履歴" />;
}
