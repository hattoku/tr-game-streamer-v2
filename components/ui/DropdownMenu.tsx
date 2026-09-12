/**
 * ドロップダウンメニュー（共通 デザイントークン仕様書 §13.3）。
 * 外側クリック・Esc・キーボード操作は Radix DropdownMenu に任せる。
 * ヘッダーのユーザードロップダウン（UIコンポーネント仕様書 §2.6）、
 * マイリストのステータス変更・「その他▼」（マイリスト仕様書 §3.1, §5.8）で使う。
 */
'use client';

import * as Radix from '@radix-ui/react-dropdown-menu';
import type { ComponentProps } from 'react';
import { cn } from './cn';

export const DropdownMenu = Radix.Root;
export const DropdownMenuTrigger = Radix.Trigger;

export function DropdownMenuContent({ className, sideOffset = 6, align = 'end', ...rest }: ComponentProps<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 min-w-[180px] rounded-[8px] border-[0.5px] border-surface-border bg-surface-elevated p-[6px] shadow-elevated',
          'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
          className,
        )}
        {...rest}
      />
    </Radix.Portal>
  );
}

export function DropdownMenuItem({ className, ...rest }: ComponentProps<typeof Radix.Item>) {
  return (
    <Radix.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-[6px] px-[10px] py-2 text-base text-text-secondary outline-none',
        'data-[highlighted]:bg-bg-btn data-[highlighted]:text-text-primary data-[disabled]:opacity-40 data-[disabled]:pointer-events-none',
        className,
      )}
      {...rest}
    />
  );
}

export function DropdownMenuLabel({ className, ...rest }: ComponentProps<typeof Radix.Label>) {
  return <Radix.Label className={cn('px-[10px] py-1 text-md text-text-muted', className)} {...rest} />;
}

export function DropdownMenuSeparator({ className, ...rest }: ComponentProps<typeof Radix.Separator>) {
  return <Radix.Separator className={cn('my-1 border-t-[0.5px] border-border-subtle', className)} {...rest} />;
}
