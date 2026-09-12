/**
 * 「ゲームタイトルから探す」（/games）の準備中ページ。
 * 本実装は document/specification/page/ページ ゲームタイトル 探す 仕様書.md に基づきフェーズ3以降。
 */
import type { Metadata } from 'next';
import { ComingSoon } from '@/components/layout/ComingSoon';

export const metadata: Metadata = { title: 'ゲームタイトルから探す' };

export default function GamesPage() {
  return <ComingSoon title="ゲームタイトルから探す" />;
}
