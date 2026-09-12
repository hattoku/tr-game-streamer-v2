/**
 * 「チャンネル名から探す」（/channels）の準備中ページ。
 * 本実装は document/specification/page/ページ チャンネル 探す 仕様書.md に基づきフェーズ3以降。
 */
import type { Metadata } from 'next';
import { ComingSoon } from '@/components/layout/ComingSoon';

export const metadata: Metadata = { title: 'チャンネル名から探す' };

export default function ChannelsPage() {
  return <ComingSoon title="チャンネル名から探す" />;
}
