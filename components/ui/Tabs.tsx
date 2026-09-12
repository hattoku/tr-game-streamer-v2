/**
 * フィルタタブ（共通 デザイントークン仕様書 §15.3、件数バッジは §15.2）。
 * キーボード操作（←→）・aria は Radix Tabs に任せる。
 * マイリストのフィルタ（マイリスト仕様書 §3）・通知一覧のフィルタ（通知仕様書 §5.3）で使う。
 */
'use client';

import * as RadixTabs from '@radix-ui/react-tabs';
import type { ComponentProps, ReactNode } from 'react';
import { CountBadge } from './Badge';
import { cn } from './cn';

export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({ className, ...rest }: ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn('flex flex-wrap items-end gap-1 border-b-[0.5px] border-border-subtle', className)}
      {...rest}
    />
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
        'group -mb-px inline-flex items-center border-b-2 border-transparent px-3 py-2 text-base text-text-tertiary',
        'transition-[color,border-color] duration-[120ms] hover:text-text-primary',
        'data-[state=active]:border-text-primary data-[state=active]:text-text-primary',
        className,
      )}
      {...rest}
    >
      {children}
      {typeof count === 'number' && (
        <CountBadge count={count} className="group-data-[state=active]:text-text-primary" />
      )}
    </RadixTabs.Trigger>
  );
}
