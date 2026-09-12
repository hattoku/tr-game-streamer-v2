/**
 * モーダル（共通 デザイントークン仕様書 §13.1）。
 * 挙動（フォーカス閉じ込め・Esc・オーバーレイクリックで閉じる・aria）は Radix Dialog に任せ、
 * 見た目だけをトークンどおりに当てる。
 * ログイン要求モーダル（UIコンポーネント仕様書 §5）・ゲームタイトル選択モーダル等の土台。
 */
'use client';

import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { XIcon } from './icons';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** 本文の要約。省略時は aria-describedby を付けない */
  description?: ReactNode;
  children?: ReactNode;
  /** 幅を広げたい場合（既定 480px） */
  maxWidthClassName?: string;
  className?: string;
}

export function Modal({ open, onOpenChange, title, description, children, maxWidthClassName = 'max-w-[480px]', className }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2',
            'rounded-[10px] border-[0.5px] border-surface-border bg-surface-elevated p-6 shadow-elevated',
            'max-h-[calc(100dvh-32px)] overflow-y-auto outline-none',
            'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
            maxWidthClassName,
            className,
          )}
        >
          <Dialog.Title className="pr-8 text-2xl font-medium text-text-primary">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-2 text-base text-text-secondary">{description}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{typeof title === 'string' ? title : 'ダイアログ'}</Dialog.Description>
          )}
          {children && <div className="mt-5">{children}</div>}
          <Dialog.Close
            aria-label="閉じる"
            className="absolute right-3 top-3 rounded-[6px] p-1 text-text-muted transition-colors duration-[120ms] hover:text-text-primary"
          >
            <XIcon size={18} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
