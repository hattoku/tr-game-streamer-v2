/** まとめの公開設定バッジ（作成者本人向け。自分のまとめ一覧・まとめ詳細で使う） */
import { StatusBadge } from '@/components/ui/Badge';
import { LockIcon } from '@/components/ui/icons';
import { VISIBILITY_LABEL, type CollectionVisibility } from '@/lib/collections-shared';

export function VisibilityBadge({ visibility }: { visibility: CollectionVisibility }) {
  return (
    <StatusBadge icon={visibility === 'private' && <LockIcon size={12} />}>{VISIBILITY_LABEL[visibility]}</StatusBadge>
  );
}
