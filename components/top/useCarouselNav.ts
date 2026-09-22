/**
 * カルーセルの送りボタン（‹ ›）用フック（共通 デザイントークン仕様書 v2.1 §6.7）。
 * `TopSection`・`MylistSection`で共用し、TOPページの4セクション（マイリスト・注目・新着・
 * タグピックアップ）すべてで同じ送りボタン挙動にする（design-consistency-reviewerの指摘対応、
 * フェーズ6ステップ2）。
 */
'use client';

import { useEffect, useRef, useState } from 'react';

export function useCarouselNav(contentDep: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  function updateEdges() {
    const el = scrollRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 0);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }

  // 中身（カード件数）が変わった後に、送りボタンのdisabled状態を再計算する
  // （初回表示時に全カードが収まっている＝スクロール不要なケースも含む）
  useEffect(updateEdges, [contentDep]);

  function scrollByPage(direction: 1 | -1) {
    const el = scrollRef.current;
    if (!el) return;
    // 仕様書は「1画面分」だが、隣のカードの一部が見える方が続きがあると分かりやすいため90%とする
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: 'smooth' });
  }

  return { scrollRef, atStart, atEnd, updateEdges, scrollByPage };
}
