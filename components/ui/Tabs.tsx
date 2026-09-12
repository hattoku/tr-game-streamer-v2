/**
 * フィルタタブ（共通 デザイントークン仕様書 v2.0 §15.3、件数バッジは §15.2）。
 * タブ列の下線 1px、アクティブは白の下線 2px＋semibold。件数はピル形状の CountBadge。
 * キーボード操作（←→）・aria は Radix Tabs に任せる。
 * マイリストのフィルタ（マイリスト仕様書 §3）・通知一覧のフィルタ（通知仕様書 §5.3）で使う。
 * タブ列の右端にソートセレクト等を置く場合は TabsList の children の後ろに `trailing` を渡す（下線の上に 8px 浮く）。
 */
'use client';

import * as RadixTabs from '@radix-ui/react-tabs';
import type { ComponentProps, ReactNode } from 'react';
import { CountBadge } from './Badge';
import { cn } from './cn';

export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

interface TabsListProps extends ComponentProps<typeof RadixTabs.List> {
  /** タブ列の右端に置く要素（ソートセレクト等） */
  trailing?: ReactNode;
}

export function TabsList({ className, trailing, children, ...rest }: TabsListProps) {
  // モバイル: タブ列（折り返し可・ラベルは折り返さない）の下に trailing を右寄せで置く
  // PC: タブ列と trailing を同じ行に置き、下線は行全体に引く
  return (
    <div className={cn('flex flex-col gap-2 md:flex-row md:items-end md:justify-between md:gap-3 md:border-b md:border-border-tabs', className)}>
      <RadixTabs.List className="flex flex-wrap items-end gap-[2px] border-b border-border-tabs md:border-0" {...rest}>
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
