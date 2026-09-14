/**
 * ページ番号リンク形式のページネーション（ページ ゲームタイトル 探す仕様書 §3.6、
 * ページ ゲームタイトル 詳細仕様書 §4.5等、20件/ページの一覧で共用）。
 * URLクエリとは同期せず、呼び出し側が持つページ番号state用のUI部品として使う。
 */
import { Button } from './Button';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { cn } from './cn';

interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, pageCount, onPageChange, className }: PaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="ページ送り" className={cn('flex items-center justify-center gap-1', className)}>
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="前のページ">
        <ChevronLeftIcon size={14} />
      </Button>
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
        <Button
          key={n}
          variant="secondary"
          size="sm"
          active={n === page}
          aria-current={n === page ? 'page' : undefined}
          onClick={() => onPageChange(n)}
        >
          {n}
        </Button>
      ))}
      <Button variant="ghost" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} aria-label="次のページ">
        <ChevronRightIcon size={14} />
      </Button>
    </nav>
  );
}
