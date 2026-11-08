/**
 * ページ番号リンク形式のページネーション（ページ ゲームタイトル 探す仕様書 §3.6、
 * ページ ゲームタイトル 詳細仕様書 §4.5等、20件/ページの一覧で共用）。
 * URLクエリとは同期せず、呼び出し側が持つページ番号state用のUI部品として使う。
 * ページが多いとき（一覧のサーバー側検索で数百ページになりうる。段階7）は、最初・最後・今のページの前後だけを出し、
 * 間は「…」で省く（スマートフォン幅 390px でも1行に収まる最大9個）。
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

/** これ以下のページ数なら全部のページ番号を出す */
const SHOW_ALL_MAX = 7;

/** 出すページ番号の並び。省いた所は null（「…」） */
export function pageItems(page: number, pageCount: number): Array<number | null> {
  if (pageCount <= SHOW_ALL_MAX) return Array.from({ length: pageCount }, (_, i) => i + 1);
  // 端の近くでは窓を広げ、出す数（「…」を含めて7個）をそろえる
  let start = Math.max(2, Math.min(page - 1, pageCount - 4));
  let end = Math.min(pageCount - 1, Math.max(page + 1, 5));
  // 「…」が1ページ分しか省かないなら、そのページ番号を出す
  if (start === 3) start = 2;
  if (end === pageCount - 2) end = pageCount - 1;
  const items: Array<number | null> = [1];
  if (start > 2) items.push(null);
  for (let n = start; n <= end; n++) items.push(n);
  if (end < pageCount - 1) items.push(null);
  items.push(pageCount);
  return items;
}

export function Pagination({ page, pageCount, onPageChange, className }: PaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="ページ送り" className={cn('flex items-center justify-center gap-1', className)}>
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="前のページ">
        <ChevronLeftIcon size={14} />
      </Button>
      {pageItems(page, pageCount).map((n, i) =>
        n === null ? (
          <span key={`gap-${i}`} aria-hidden className="px-1 text-md text-text-muted">
            …
          </span>
        ) : (
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
        ),
      )}
      <Button variant="ghost" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} aria-label="次のページ">
        <ChevronRightIcon size={14} />
      </Button>
    </nav>
  );
}
