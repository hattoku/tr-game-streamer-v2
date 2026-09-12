/**
 * フォーム入力要素（共通 デザイントークン仕様書 v2.0 §10）。
 * Input / Textarea / PasswordInput と、ラベル＋エラーメッセージをまとめる Field、Checkbox。
 * 入力面は 1px の半透明白の枠＋内側の影で一段沈めて見せ、フォーカスで白枠＋リング。
 * セレクトはブラウザ標準を使わない（OSのダーク配色と混ざり文字が読めなくなる）。
 * `SelectMenu`（DropdownMenu.tsx）を使うこと。
 */
'use client';

import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { cn } from './cn';
import { EyeIcon, EyeOffIcon } from './icons';

export const INPUT_CLASS =
  'w-full rounded-[7px] border border-input-border bg-input-bg px-3 py-[9px] text-base text-input-text inset-shadow-input ' +
  'placeholder:text-input-placeholder transition-[border-color,box-shadow] duration-[120ms] outline-none ' +
  'focus:border-border-active focus:shadow-focus-ring aria-invalid:border-input-error disabled:opacity-40';

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cn(INPUT_CLASS, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cn(INPUT_CLASS, 'min-h-[96px] resize-y', className)} {...rest} />;
}

/** パスワード入力（表示切替付き。ログイン仕様書 §12.1 の [表示]） */
export function PasswordInput({ className, ...rest }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input type={visible ? 'text' : 'password'} className={cn(INPUT_CLASS, 'pr-10', className)} {...rest} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'パスワードを隠す' : 'パスワードを表示'}
        aria-pressed={visible}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
      >
        {visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
      </button>
    </div>
  );
}

interface FieldProps {
  label: ReactNode;
  /** 入力要素に渡す id を省略した場合は自動生成する */
  htmlFor?: string;
  error?: ReactNode;
  hint?: ReactNode;
  className?: string;
  /** 関数を渡すと生成した id と aria 属性を受け取れる */
  children: ReactNode | ((props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode);
}

export function Field({ label, htmlFor, error, hint, className, children }: FieldProps) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-[6px]', className)}>
      <label htmlFor={id} className="text-md text-text-tertiary">
        {label}
      </label>
      {typeof children === 'function'
        ? children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })
        : children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-md text-input-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-md text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** チェックボックス＋ラベル（§10、accent-color は globals.css で指定） */
export function Checkbox({ label, className, ...rest }: ComponentProps<'input'> & { label: ReactNode }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-base text-text-secondary', className)}>
      <input type="checkbox" className="size-4" {...rest} />
      {label}
    </label>
  );
}
