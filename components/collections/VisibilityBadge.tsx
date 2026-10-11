/** まとめの公開設定バッジ（作成者本人向け。自分のまとめ一覧・まとめ詳細で使う） */
import { LockIcon } from '@/components/ui/icons';
import { VISIBILITY_LABEL, type CollectionVisibility } from '@/lib/collections-shared';

export function VisibilityBadge({ visibility }: { visibility: CollectionVisibility }) {
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-[4px] bg-bg-hover px-2 py-[2px] text-sm text-text-muted">
      {visibility === 'private' && <LockIcon size={12} />}
      {VISIBILITY_LABEL[visibility]}
    </span>
  );
}
