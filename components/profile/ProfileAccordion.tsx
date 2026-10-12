/**
 * プロフィールのじゃばら展開（ページ 設定 プロフィール仕様書 §3.2）。マイリスト・レビュー履歴・まとめ・保存したまとめで共用。
 * 折りたたみ時は上位3件＋「すべて見る（N件）▼」、展開時は20件/ページのページ番号リンク＋上部に「折りたたむ ▲」。
 * 3件以下はボタンを出さず全件をそのまま並べる。
 */
'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/ui/icons';

const COLLAPSED_COUNT = 3;
const PAGE_SIZE = 20;

export function ProfileAccordion<T>({
  items,
  getKey,
  renderItem,
  label,
}: {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** 読み上げ用のセクション名（「マイリストをすべて見る」等） */
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const collapsible = items.length > COLLAPSED_COUNT;
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = !collapsible
    ? items
    : expanded
      ? items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
      : items.slice(0, COLLAPSED_COUNT);

  return (
    <div className="flex flex-col gap-3">
      {collapsible && expanded && (
        <Button variant="ghost" size="sm" className="self-center" aria-label={`${label}を折りたたむ`} onClick={() => setExpanded(false)}>
          折りたたむ
          <ChevronUpIcon size={14} />
        </Button>
      )}
      <ol className="flex flex-col gap-3">
        {visible.map((item) => (
          <li key={getKey(item)}>{renderItem(item)}</li>
        ))}
      </ol>
      {collapsible &&
        (expanded ? (
          <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="self-center"
            aria-label={`${label}をすべて見る（${items.length}件）`}
            onClick={() => {
              setPage(1);
              setExpanded(true);
            }}
          >
            すべて見る（{items.length}件）
            <ChevronDownIcon size={14} />
          </Button>
        ))}
    </div>
  );
}
