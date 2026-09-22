/**
 * TOPページの各セクション共通のヘッダー行（見出し＋PCのみの送りボタン‹ ›＋「すべて見る →」、
 * 共通 デザイントークン仕様書 v2.1 §6.7）。`TopSection`・`MylistSection`で共用する。
 * `nav`を渡さない（カルーセルが空・読み込み中等）場合は送りボタンを出さない。
 */
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/Card';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons';

interface SectionHeaderRowProps {
  title: string;
  viewAllHref: string;
  nav?: { atStart: boolean; atEnd: boolean; onPrev: () => void; onNext: () => void } | null;
}

export function SectionHeaderRow({ title, viewAllHref, nav }: SectionHeaderRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <SectionHeading as="h2">{title}</SectionHeading>
      <div className="flex items-center gap-2">
        {nav && (
          <div className="hidden items-center gap-1 md:flex">
            <Button variant="ghost" size="sm" aria-label="前へ" disabled={nav.atStart} onClick={nav.onPrev}>
              <ChevronLeftIcon size={16} />
            </Button>
            <Button variant="ghost" size="sm" aria-label="次へ" disabled={nav.atEnd} onClick={nav.onNext}>
              <ChevronRightIcon size={16} />
            </Button>
          </div>
        )}
        <Link href={viewAllHref} className="whitespace-nowrap text-md text-text-tertiary hover:text-text-primary">
          すべて見る →
        </Link>
      </div>
    </div>
  );
}
