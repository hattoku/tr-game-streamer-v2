/**
 * 基本情報セクション（ページ 再生リスト詳細 仕様書「基本情報セクション」）。
 * 表示順: タイトル（1行省略）／スコア・マイリスト数・レビュー数／タグ／参照元URL。
 * スコアはレビューが無い間は「評価なし」（信頼度スコアリングシステム仕様書）。
 * マイリスト登録は再生リスト詳細ページの視聴ステータス記録UI（ReviewForm）に一本化しており、
 * このカードは表示専用（ページ マイリスト機能仕様書 §1.3）。
 */
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { StarRating } from '@/components/ui/StarRating';
import { LockIcon, PencilIcon, YouTubeIcon } from '@/components/ui/icons';
import type { ResolvedTag } from '@/lib/tags';

interface PlaylistInfoCardProps {
  title: string;
  score: number | null;
  mylistCount: number;
  reviewCount: number;
  tags: ResolvedTag[];
  referenceUrl: string;
  /** ログイン済みのときのみ渡す（タグ編集アイコンの表示条件。ゲームタイトル詳細仕様書 §8.2準拠） */
  onEditTags?: () => void;
}

export function PlaylistInfoCard({ title, score, mylistCount, reviewCount, tags, referenceUrl, onEditTags }: PlaylistInfoCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <h1 className="truncate text-2xl font-medium text-text-primary" title={title}>
        {title}
      </h1>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-md">
        {score == null ? (
          <span className="text-text-muted">評価なし</span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <StarRating value={score} readOnly size={16} />
            <span className="text-score leading-none text-brand-score">{score.toFixed(1)}</span>
            <span className="text-text-muted">/ 5</span>
          </span>
        )}
        <span className="text-text-muted">
          マイリスト: <span className="text-text-secondary">{mylistCount}</span>
        </span>
        <span className="text-text-muted">
          レビュー: <span className="text-text-secondary">{reviewCount}</span>
        </span>
      </div>

      {(tags.length > 0 || onEditTags) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {tags.map((t) =>
            t.fixed ? (
              <span key={t.id} className="inline-flex items-center gap-1 text-sm text-text-secondary">
                <LockIcon size={11} />
                {t.name}
              </span>
            ) : (
              <Tag key={t.id} href={`/playlists?tag=${encodeURIComponent(t.id)}`}>
                {t.name}
              </Tag>
            ),
          )}
          {onEditTags && (
            <button
              type="button"
              aria-label="タグを編集する"
              onClick={onEditTags}
              className="rounded-[6px] p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
            >
              <PencilIcon size={13} />
            </button>
          )}
        </div>
      )}

      <a
        href={referenceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-[5px] text-md text-text-btn hover:text-text-primary"
      >
        <YouTubeIcon />
        YouTubeの再生リストを見る ↗
      </a>
    </Card>
  );
}
