/**
 * 基本情報セクション（ページ 再生リスト詳細 仕様書「基本情報セクション」）。
 * 表示順: タイトル（1行省略）／スコア・マイリスト数・レビュー数／タグ／参照元URL。
 * スコアはレビューが無い間は「評価なし」（信頼度スコアリングシステム仕様書）。
 * マイリスト追加ボタン（マイリスト仕様書 §1.3）はこのカードの下部に置く。
 */
import type { ReactNode } from 'react';
import { Card, CardDivider } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { YouTubeIcon } from '@/components/ui/icons';

interface PlaylistInfoCardProps {
  title: string;
  score: number | null;
  mylistCount: number;
  reviewCount: number;
  tags: Array<{ id: string; name: string }>;
  referenceUrl: string;
  /** AddToMylistButton を渡す */
  mylistAction?: ReactNode;
}

// 星表示の暫定版。半星（信頼度スコアリングシステム仕様書の「半分塗りつぶし」）はレビュー機能の
// フェーズ3実装時に SVG で対応する。現状は score が常に null のため表示されない
function Stars({ score }: { score: number }) {
  const full = Math.min(5, Math.max(0, Math.round(score)));
  return (
    <span aria-hidden className="tracking-[1px] text-brand-score">
      {'★'.repeat(full)}
      {'☆'.repeat(5 - full)}
    </span>
  );
}

export function PlaylistInfoCard({ title, score, mylistCount, reviewCount, tags, referenceUrl, mylistAction }: PlaylistInfoCardProps) {
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
            <Stars score={score} />
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

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {tags.map((t) => (
            <Tag key={t.id} href={`/playlists?tag=${encodeURIComponent(t.id)}`}>
              {t.name}
            </Tag>
          ))}
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

      {mylistAction && (
        <>
          <CardDivider />
          {mylistAction}
        </>
      )}
    </Card>
  );
}
