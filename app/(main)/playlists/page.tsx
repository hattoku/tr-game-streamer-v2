/**
 * 「再生リストを探す」の最小版（/playlists）。
 * 本来の仕様（document/specification/page/ページ 再生リストを探す 仕様書.md: 検索・絞り込み・ソート）は
 * フェーズ3以降。フェーズ2.5 では、モバイルのボトムタブ「さがす」とヘッダーナビの遷移先として
 * 公開再生リストの一覧（新しい順）だけを表示する。
 */
import type { Metadata } from 'next';
import { PlaylistGrid } from '@/components/playlists/PlaylistGrid';
import { SectionHeading } from '@/components/ui/Card';

export const metadata: Metadata = { title: '再生リストを探す' };

export default function PlaylistsPage() {
  return (
    <div>
      <SectionHeading className="mb-5">再生リストを探す</SectionHeading>
      <PlaylistGrid max={48} />
    </div>
  );
}
