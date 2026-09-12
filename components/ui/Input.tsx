/**
 * フォーム入力要素（共通 デザイントークン仕様書 §10）。
 * Input / Select / Textarea と、ラベル＋エラーメッセージをまとめる Field。
 */
'use client';

import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { cn } from './cn';
import { EyeIcon, EyeOffIcon } from './icons';

const INPUT_CLASS =
  'w-full rounded-[7px] border-[0.5px] border-input-border bg-input-bg px-3 py-[9px] text-base text-input-text ' +
  'placeholder:text-input-placeholder transition-[border-color] duration-[120ms] ' +
  'aria-invalid:border-input-error disabled:opacity-40';

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cn(INPUT_CLASS, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cn(INPUT_CLASS, 'min-h-[96px] resize-y', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <select className={cn(INPUT_CLASS, 'appearance-none pr-8 bg-no-repeat', className)} style={SELECT_ARROW} {...rest}>
      {children}
    </select>
  );
}

// セレクトの矢印（#aaaaaa のシェブロン）。画像リソースを増やさず data URI で埋め込む
const SELECT_ARROW = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23aaaaaa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundPosition: 'right 10px center',
} as const;

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
