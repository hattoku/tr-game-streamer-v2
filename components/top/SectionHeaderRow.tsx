/**
 * TOPページの各セクション共通のヘッダー行（見出し＋PCのみの送りボタン‹ ›＋一覧リンク「すべて見る ›」、
 * 共通 デザイントークン仕様書 v2.6 §6.7）。`TopSection`・`MylistSection`で共用する。
 * `nav`を渡さない（カルーセルが空・読み込み中等）場合は送りボタンを出さない。
 */
import { Button, LinkButton } from '@/components/ui/Button';
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
            {/* 性格の異なるボタン（送り／一覧リンク）の間の縦線セパレーター（§4.4） */}
            <span aria-hidden className="ml-1 h-[18px] w-px bg-white/10" />
          </div>
        )}
        <LinkButton href={viewAllHref} variant="ghost" size="sm">
          すべて見る
          <ChevronRightIcon size={14} />
        </LinkButton>
      </div>
    </div>
  );
}
