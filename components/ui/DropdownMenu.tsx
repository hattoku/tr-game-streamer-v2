/**
 * ドロップダウンメニュー（共通 デザイントークン仕様書 v2.0 §13.3）と、それを使ったセレクト（§10）。
 * 面は浮遊面（グラデーション＋1px枠＋影、§16 段階2）。現在の値は選択面＋チェックアイコン。
 * 外側クリック・Esc・キーボード操作は Radix DropdownMenu に任せる。
 * ヘッダーのユーザードロップダウン（UIコンポーネント仕様書 §2.6）、
 * マイリストのステータス変更・ソート・「その他▼」（マイリスト仕様書 §3.1, §4, §5.8）で使う。
 */
'use client';

import * as Radix from '@radix-ui/react-dropdown-menu';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn';
import { CheckIcon, ChevronDownIcon } from './icons';

export const DropdownMenu = Radix.Root;
export const DropdownMenuTrigger = Radix.Trigger;
export const DropdownMenuRadioGroup = Radix.RadioGroup;

export function DropdownMenuContent({ className, sideOffset = 6, align = 'end', ...rest }: ComponentProps<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 min-w-[180px] rounded-[10px] border border-surface-border bg-gradient-elevated p-[6px] shadow-elevated',
          'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
          className,
        )}
        {...rest}
      />
    </Radix.Portal>
  );
}

const ITEM_CLASS =
  'flex cursor-pointer select-none items-center gap-2 rounded-[6px] px-[10px] py-2 text-base text-text-secondary outline-none ' +
  'transition-colors duration-[120ms] data-[highlighted]:bg-bg-hover data-[highlighted]:text-text-primary ' +
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-40';

export function DropdownMenuItem({ className, ...rest }: ComponentProps<typeof Radix.Item>) {
  return <Radix.Item className={cn(ITEM_CLASS, className)} {...rest} />;
}

/** 現在の値を持つ項目（ステータス変更・ソート）。選択中は選択面＋右端にチェック */
export function DropdownMenuRadioItem({ className, children, ...rest }: ComponentProps<typeof Radix.RadioItem>) {
  return (
    <Radix.RadioItem
      className={cn(ITEM_CLASS, 'justify-between data-[state=checked]:bg-bg-selected data-[state=checked]:text-text-primary', className)}
      {...rest}
    >
      <span className="flex items-center gap-2">{children}</span>
      <Radix.ItemIndicator className="text-text-primary">
        <CheckIcon size={12} />
      </Radix.ItemIndicator>
    </Radix.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...rest }: ComponentProps<typeof Radix.Label>) {
  return <Radix.Label className={cn('px-[10px] py-1 text-md text-text-muted', className)} {...rest} />;
}

export function DropdownMenuSeparator({ className, ...rest }: ComponentProps<typeof Radix.Separator>) {
  return <Radix.Separator className={cn('my-1 border-t border-border-divider', className)} {...rest} />;
}

export interface SelectOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SelectMenuProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: Array<SelectOption<T>>;
  /** 表示部の先頭に付ける固定ラベル（例:「ソート:」） */
  prefix?: ReactNode;
  'aria-label'?: string;
  className?: string;
  align?: ComponentProps<typeof Radix.Content>['align'];
  disabled?: boolean;
}

/**
 * セレクト（§10「セレクトはブラウザ標準のドロップダウンを使わない」）。
 * 表示部は入力要素と同じ面にシェブロン、開いた一覧はドロップダウン（§13.3）。
 */
export function SelectMenu<T extends string>({ value, onValueChange, options, prefix, className, align = 'end', disabled, ...rest }: SelectMenuProps<T>) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={rest['aria-label']}
        className={cn(
          'inline-flex items-center gap-2 rounded-[7px] border border-input-border bg-input-bg py-[6px] pl-3 pr-[10px] text-md text-text-secondary',
          'transition-[border-color,box-shadow] duration-[120ms] hover:border-border-control data-[state=open]:border-border-active data-[state=open]:shadow-focus-ring',
          className,
        )}
      >
        {prefix && <span className="text-text-muted">{prefix}</span>}
        <span className="text-text-primary">{current?.label ?? value}</span>
        <ChevronDownIcon size={12} className="text-text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onValueChange(v as T)}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
