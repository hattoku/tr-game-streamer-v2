/**
 * フィルタタブ（共通 デザイントークン仕様書 v2.9 §15.3、件数バッジは §15.2）。
 * タブ列の下線 1px、アクティブは白の下線 2px＋semibold。件数はピル形状の CountBadge。
 * キーボード操作（←→）・aria は Radix Tabs に任せる。
 * マイリストのフィルタ（マイリスト仕様書 §3）・通知一覧のフィルタ（通知仕様書 §5.3）で使う。
 * タブ列の右端にソートセレクト等を置く場合は TabsList の children の後ろに `trailing` を渡す（下線の上に 8px 浮く）。
 */
'use client';

import * as RadixTabs from '@radix-ui/react-tabs';
import { useEffect, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { CountBadge } from './Badge';
import { cn } from './cn';

export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

interface TabsListProps extends ComponentProps<typeof RadixTabs.List> {
  /** タブ列の右端に置く要素（ソートセレクト等） */
  trailing?: ReactNode;
  /**
   * true の場合、タブ列を折り返さず横スクロールにする（TOPページ 注目セクションのジャンルタブ、マイリストのフィルタタブ等）。
   * 続きがある側の端はフェードし、選択中のタブは表示範囲まで自動で横スクロールする。
   * `cn` は tailwind-merge を持たないため、`flex-wrap`/`flex-nowrap` を両方渡して後勝ちに賭けるのではなく
   * どちらか一方だけを出し分ける。
   * 縦方向は `overflow-y-hidden` で固定する（TabsTrigger の `-mb-px` のはみ出しで縦に1pxスクロール可能になり、
   * スマホでページを縦スクロールする際にタブ列に指が引っかかるのを防ぐ）。
   */
  scrollable?: boolean;
}

/** 横スクロール時、続きがある側の端をフェードさせる幅 */
const SCROLL_FADE_PX = 24;
/** 選択中とみなす要素。Radix 外のトリガー（マイリストの「その他▼」等）は `data-active="true"` を付ける */
const ACTIVE_SELECTOR = '[data-state="active"], [data-active="true"]';

/**
 * scrollable なタブ列の付帯挙動（共通 デザイントークン仕様書 §15.3、マイリスト仕様書 §3.1）。
 * - 左右に続きがあるかを判定し、その側の端を mask-image でフェードさせる（はみ出していなければ何もしない）
 * - 選択中のタブがはみ出していれば表示範囲まで横スクロールする。
 *   scrollIntoView はページの縦スクロールを誘発しうるため、リストの scrollLeft だけを動かす
 */
function useScrollableTabs(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });

  useEffect(() => {
    const list = ref.current;
    if (!enabled || !list) return;

    const updateOverflow = () => {
      const start = list.scrollLeft > 1;
      const end = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
      setOverflow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    const revealActive = (behavior: ScrollBehavior) => {
      const active = list.querySelector<HTMLElement>(ACTIVE_SELECTOR);
      if (!active) return;
      // リスト自身を relative にしているので offsetLeft はリスト内の位置になる
      const left = active.offsetLeft;
      const right = left + active.offsetWidth;
      if (left < list.scrollLeft + SCROLL_FADE_PX) {
        list.scrollTo({ left: Math.max(0, left - SCROLL_FADE_PX), behavior });
      } else if (right > list.scrollLeft + list.clientWidth - SCROLL_FADE_PX) {
        list.scrollTo({ left: right - list.clientWidth + SCROLL_FADE_PX, behavior });
      }
    };

    let lastActive = list.querySelector(ACTIVE_SELECTOR);
    revealActive('auto');
    updateOverflow();

    list.addEventListener('scroll', updateOverflow, { passive: true });
    // 件数バッジの桁変化など、子の幅だけが変わった場合も判定し直す
    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(list);
    for (const child of list.children) resizeObserver.observe(child);
    // 選択の切り替え（data-state / data-active の変化）を拾って選択中タブを見せる。
    // ドロップダウンのトリガーも開閉で data-state（open/closed）が変わるため、選択中の要素が実際に変わったときだけ動かす
    const mutationObserver = new MutationObserver(() => {
      const active = list.querySelector(ACTIVE_SELECTOR);
      if (active === lastActive) return;
      lastActive = active;
      revealActive('smooth');
      updateOverflow();
    });
    mutationObserver.observe(list, { subtree: true, attributes: true, attributeFilter: ['data-state', 'data-active'] });

    return () => {
      list.removeEventListener('scroll', updateOverflow);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [enabled]);

  const { start, end } = overflow;
  const style: CSSProperties | undefined =
    enabled && (start || end)
      ? (() => {
          const mask = `linear-gradient(to right, ${start ? 'transparent' : 'black'}, black ${SCROLL_FADE_PX}px, black calc(100% - ${SCROLL_FADE_PX}px), ${end ? 'transparent' : 'black'})`;
          return { maskImage: mask, WebkitMaskImage: mask };
        })()
      : undefined;

  return { ref, style };
}

export function TabsList({ className, trailing, scrollable = false, children, style, ...rest }: TabsListProps) {
  const { ref, style: fadeStyle } = useScrollableTabs(scrollable);
  // モバイル: タブ列（scrollable でなければ折り返し可・ラベルは折り返さない）の下に trailing を右寄せで置く
  // PC: タブ列と trailing を同じ行に置き、下線は行全体に引く
  return (
    <div className={cn('flex flex-col gap-2 md:flex-row md:items-end md:justify-between md:gap-3 md:border-b md:border-border-tabs', className)}>
      <RadixTabs.List
        ref={ref}
        className={cn(
          'flex items-end gap-[2px] border-b border-border-tabs md:border-0',
          scrollable
            ? // フォーカスリングは外側に出すとスクロールコンテナで切れるため内側に描く
              'relative min-w-0 flex-nowrap overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_*:focus-visible]:outline-offset-[-2px]'
            : 'flex-wrap',
        )}
        style={fadeStyle ? { ...style, ...fadeStyle } : style}
        {...rest}
      >
        {children}
      </RadixTabs.List>
      {trailing && <div className="shrink-0 self-end md:mb-2">{trailing}</div>}
    </div>
  );
}

interface TabsTriggerProps extends ComponentProps<typeof RadixTabs.Trigger> {
  count?: number;
  children: ReactNode;
}

export function TabsTrigger({ count, className, children, ...rest }: TabsTriggerProps) {
  return (
    <RadixTabs.Trigger
      className={cn(
        'group -mb-px inline-flex items-center whitespace-nowrap border-b-2 border-transparent px-3 py-[10px] text-base text-text-tertiary md:px-[14px]',
        'transition-[color,border-color] duration-[120ms] hover:text-text-primary',
        'data-[state=active]:border-border-active data-[state=active]:font-semibold data-[state=active]:text-text-primary',
        className,
      )}
      {...rest}
    >
      {children}
      {typeof count === 'number' && (
        <CountBadge count={count} className="group-data-[state=active]:bg-bg-selected group-data-[state=active]:text-text-primary" />
      )}
    </RadixTabs.Trigger>
  );
}
