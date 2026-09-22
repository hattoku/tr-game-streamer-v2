/**
 * TOPページの横スクロールセクション共通レイアウト（ページ top 仕様書 §5〜§8）。
 * 見出し＋「すべて見る →」＋PCのみの送りボタン（‹ ›、共通 デザイントークン仕様書 v2.1 §6.7）と、
 * `Carousel`（本体のスクロール領域）をまとめる。中身（カード列）は呼び出し側が用意する。
 * ヘッダー行は`SectionHeaderRow`、送りボタンの状態管理は`useCarouselNav`に共通化し、
 * `MylistSection`（カルーセル以外の状態も持つため`TopSection`を使わない）と挙動を揃えている。
 */
'use client';

import type { ReactNode } from 'react';
import { Carousel } from '@/components/ui/Carousel';
import { SectionHeaderRow } from '@/components/top/SectionHeaderRow';
import { useCarouselNav } from '@/components/top/useCarouselNav';

interface TopSectionProps {
  title: string;
  viewAllHref: string;
  /** ヘッダー行とカルーセルの間に置く要素（ジャンルタブ等、注目の再生リストセクションで使用） */
  extra?: ReactNode;
  /** カルーセルの中身（`CarouselItem`の並び） */
  children: ReactNode;
}

export function TopSection({ title, viewAllHref, extra, children }: TopSectionProps) {
  const { scrollRef, atStart, atEnd, updateEdges, scrollByPage } = useCarouselNav(children);

  return (
    <section className="flex flex-col gap-4">
      <SectionHeaderRow
        title={title}
        viewAllHref={viewAllHref}
        nav={{ atStart, atEnd, onPrev: () => scrollByPage(-1), onNext: () => scrollByPage(1) }}
      />
      {extra}
      <Carousel ref={scrollRef} ariaLabel={title} onScroll={updateEdges}>
        {children}
      </Carousel>
    </section>
  );
}
