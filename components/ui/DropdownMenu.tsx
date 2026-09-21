/**
 * ドロップダウンメニュー（共通 デザイントークン仕様書 v2.0 §13.3）と、それを使ったセレクト（§10）。
 * 面は浮遊面（グラデーション＋1px枠＋影、§16 段階2）。現在の値は選択面＋チェックアイコン。
 * 外側クリック・Esc・キーボード操作は Radix DropdownMenu に任せる。
 * ヘッダーのユーザードロップダウン（UIコンポーネント仕様書 §2.6）、
 * マイリストのステータス変更・ソート・「その他▼」（マイリスト仕様書 §3.1, §4, §5.8）で使う。
 * 複数選択版の `MultiSelectMenu` はゲームタイトル登録モーダルのテーマ・プラットフォーム選択
 * （管理 マスタ管理仕様書 §7.1、2026-09-22）で使う。
 */
'use client';

import * as Radix from '@radix-ui/react-dropdown-menu';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { cn } from './cn';
import { CheckIcon, ChevronDownIcon, SearchIcon } from './icons';
import { INPUT_CLASS } from './Input';

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

/**
 * 複数選択できる項目（MultiSelectMenu）。見た目は DropdownMenuRadioItem と同じ「選択面＋右端にチェック」。
 * 選んでもメニューを閉じない（onSelect を抑止）ので、連続して複数の項目をON/OFFできる
 */
export function DropdownMenuCheckboxItem({ className, children, onSelect, ...rest }: ComponentProps<typeof Radix.CheckboxItem>) {
  return (
    <Radix.CheckboxItem
      className={cn(ITEM_CLASS, 'justify-between data-[state=checked]:bg-bg-selected data-[state=checked]:text-text-primary', className)}
      onSelect={(e) => {
        e.preventDefault();
        onSelect?.(e);
      }}
      {...rest}
    >
      <span className="flex items-center gap-2">{children}</span>
      <Radix.ItemIndicator className="text-text-primary">
        <CheckIcon size={12} />
      </Radix.ItemIndicator>
    </Radix.CheckboxItem>
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

// セレクト表示部（入力要素と同じ面にシェブロン）。SelectMenu / MultiSelectMenu で共用
const SELECT_TRIGGER_CLASS =
  'inline-flex items-center gap-2 rounded-[7px] border border-input-border bg-input-bg py-[6px] pl-3 pr-[10px] text-md text-text-secondary ' +
  'transition-[border-color,box-shadow] duration-[120ms] hover:border-border-control data-[state=open]:border-border-active data-[state=open]:shadow-focus-ring';

/**
 * セレクト（§10「セレクトはブラウザ標準のドロップダウンを使わない」）。
 * 表示部は入力要素と同じ面にシェブロン、開いた一覧はドロップダウン（§13.3）。
 */
export function SelectMenu<T extends string>({ value, onValueChange, options, prefix, className, align = 'end', disabled, ...rest }: SelectMenuProps<T>) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={disabled} aria-label={rest['aria-label']} className={cn(SELECT_TRIGGER_CLASS, className)}>
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

interface MultiSelectMenuProps<T extends string> {
  values: ReadonlySet<T>;
  /** 項目をクリックしたとき（ON/OFFの切り替え自体は呼び出し側で行う） */
  onToggle: (value: T) => void;
  /** 絞り込み検索の対象になるため label は文字列 */
  options: Array<{ value: T; label: string }>;
  /** 表示部の文言（例:「テーマを選択」）。選択中は件数を添える */
  placeholder: string;
  /** 指定すると一覧の先頭に部分一致の絞り込み検索窓を出す（プレースホルダー文言。例:「テーマ名で絞り込み」） */
  filterPlaceholder?: string;
  'aria-label'?: string;
  className?: string;
  align?: ComponentProps<typeof Radix.Content>['align'];
  disabled?: boolean;
}

// 絞り込みの照合用: 全角/半角・大文字小文字の違いを吸収する
function normalizeForFilter(s: string): string {
  return s.normalize('NFKC').toLowerCase().trim();
}

/**
 * 複数選択セレクト。表示部は SelectMenu と同じで、選択中の件数だけを示す（選択済みの内容は
 * 呼び出し側でチップ等に並べる想定）。一覧は選んでも閉じず、項目数が多いときはスクロールする。
 * `filterPlaceholder` を渡すと一覧の先頭に絞り込み検索窓が付く（項目数が多く似た名前が並ぶ
 * テーマ選択向け。2026-09-22ユーザー要望）。開いたときは検索窓にフォーカスし、閉じると絞り込みを消す。
 */
export function MultiSelectMenu<T extends string>({
  values,
  onToggle,
  options,
  placeholder,
  filterPlaceholder,
  className,
  align = 'start',
  disabled,
  ...rest
}: MultiSelectMenuProps<T>) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = normalizeForFilter(query);
  const visible = normalizedQuery ? options.filter((o) => normalizeForFilter(o.label).includes(normalizedQuery)) : options;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) {
          setQuery('');
          return;
        }
        // 検索窓があるときは、Radix がマウント時に行う一覧本体へのフォーカスの後で検索窓へ移す
        // （DropdownMenu.Content は onOpenAutoFocus を公開していないため、1ティック後に上書きする）
        if (filterPlaceholder) setTimeout(() => inputRef.current?.focus(), 0);
      }}
    >
      <DropdownMenuTrigger disabled={disabled} aria-label={rest['aria-label']} className={cn(SELECT_TRIGGER_CLASS, className)}>
        <span className={values.size > 0 ? 'text-text-primary' : 'text-text-muted'}>
          {placeholder}
          {values.size > 0 && ` (${values.size})`}
        </span>
        <ChevronDownIcon size={12} className="text-text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="flex max-h-[320px] flex-col">
        {filterPlaceholder && (
          <div className="relative mb-1 shrink-0">
            <SearchIcon size={13} className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              placeholder={filterPlaceholder}
              aria-label={filterPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
              // Radix Menu は文字キーを項目のタイプアヘッド（先頭一致で項目へフォーカス移動）に使うため、
              // 検索窓への入力がメニュー側に届かないようにする。Esc（閉じる）と Tab（メニュー外への
              // 移動抑止）は Radix に任せ、↓キーは絞り込み後の先頭項目へフォーカスを移す
              onKeyDown={(e) => {
                if (e.key === 'Escape' || e.key === 'Tab') return;
                e.stopPropagation();
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  e.currentTarget.closest('[role="menu"]')?.querySelector<HTMLElement>('[role="menuitemcheckbox"]')?.focus();
                }
              }}
              className={cn(INPUT_CLASS, 'py-[6px] pl-8 text-md')}
            />
          </div>
        )}
        <div className="min-h-0 overflow-y-auto">
          {visible.map((o) => (
            <DropdownMenuCheckboxItem key={o.value} checked={values.has(o.value)} onCheckedChange={() => onToggle(o.value)}>
              {o.label}
            </DropdownMenuCheckboxItem>
          ))}
          {visible.length === 0 && <p className="px-[10px] py-2 text-md text-text-muted">該当する項目がありません</p>}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
