/**
 * 詳細ページ（再生リスト・ゲームタイトル）の「タグ」行。
 * 行頭に「タグ」ラベルを常時表示することで、末尾の鉛筆アイコンが
 * タグに対する編集であることを明示する（ゲームタイトル詳細仕様書 §タグ編集アイコン／第8章、
 * 共通デザイントークン仕様書 §7 準拠）。
 * タグが0件でログイン済みの場合は、鉛筆の代わりに「＋ タグを追加」チップを表示する
 * （2026-09-23、再生リスト詳細ページで鉛筆アイコン単独表示がわかりにくいとの指摘を受けて追加）。
 */
import { cn } from '@/components/ui/cn';
import { Tag, TAG_BASE_CLASS } from '@/components/ui/Tag';
import { LockIcon, PencilIcon, PlusIcon } from '@/components/ui/icons';
import type { ResolvedTag } from '@/lib/tags';

interface TagRowProps {
  tags: ResolvedTag[];
  /** タグIDから検索結果ページへのリンク先を組み立てる（/playlists?tag= or /games?tag=） */
  hrefForTag: (tagId: string) => string;
  /** ログイン済みのときのみ渡す。未指定なら閲覧のみ（鉛筆・追加チップは出さない） */
  onEdit?: () => void;
  className?: string;
}

// ホバーで枠線は変えない（共通デザイントークン仕様書 §7.1「border: 変化なし」）。
// border-border-card-hover は値が同じでも Card のホバー専用トークンであり意味が異なるため転用しない。
const ADD_TAG_CLASS = cn(
  TAG_BASE_CLASS,
  'gap-1 border border-dashed border-border-control text-text-tertiary hover:bg-bg-hover hover:text-text-primary',
);

export function TagRow({ tags, hrefForTag, onEdit, className }: TagRowProps) {
  if (tags.length === 0 && !onEdit) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <span className="shrink-0 text-sm text-text-muted">タグ</span>
      {tags.map((t) =>
        t.fixed ? (
          <span key={t.id} className="inline-flex items-center gap-1 text-sm text-text-secondary">
            <LockIcon size={11} />
            {t.name}
          </span>
        ) : (
          <Tag key={t.id} href={hrefForTag(t.id)}>
            {t.name}
          </Tag>
        ),
      )}
      {onEdit &&
        (tags.length === 0 ? (
          <button type="button" onClick={onEdit} className={ADD_TAG_CLASS}>
            <PlusIcon size={11} />
            タグを追加
          </button>
        ) : (
          <button
            type="button"
            aria-label="タグを編集する"
            title="タグを編集する"
            onClick={onEdit}
            className="rounded-[6px] p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
          >
            <PencilIcon size={13} />
          </button>
        ))}
    </div>
  );
}
