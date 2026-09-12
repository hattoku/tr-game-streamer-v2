/**
 * TOP ページの最小版。
 * 本来の TOP（document/specification/page/ページ top 仕様書.md: おすすめ・続きから見る等）は
 * フェーズ3以降で実装する。フェーズ2.5 では「登録済み再生リスト一覧（新しい順）」だけを置き、
 * 再生リスト詳細ページへの導線とヘッダーロゴ・ボトムタブ「ホーム」の遷移先を確保する
 * （wiki/sources/2026-09-11-phase2.5-design-plan.md §4 ステップ2）。
 */
import { PlaylistGrid } from '@/components/playlists/PlaylistGrid';

export default function HomePage() {
  return (
    <div>
      <h1 className="mb-5 text-xl font-medium text-text-primary">新着の再生リスト</h1>
      <PlaylistGrid />
    </div>
  );
}
