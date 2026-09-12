/**
 * 準備中ページの共通表示。
 * モバイルの「さがす」タブ列（UIコンポーネント仕様書 §2.7）が機能するよう、フェーズ3以降で
 * 実装予定のページに暫定で置く。空状態コンポーネント（同仕様書 §8）を流用。
 */
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeading } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { InventoryIcon } from '@/components/ui/icons';

export function ComingSoon({ title }: { title: string }) {
  return (
    <div>
      <SectionHeading className="mb-5">{title}</SectionHeading>
      <EmptyState
        icon={<InventoryIcon />}
        title="この機能は準備中です"
        description="順次公開していきます。今は再生リストの一覧からお探しください"
        action={
          <LinkButton href="/playlists" variant="primary">
            再生リストを探す
          </LinkButton>
        }
      />
    </div>
  );
}
