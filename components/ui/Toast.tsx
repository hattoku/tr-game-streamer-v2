/**
 * トースト通知（共通 uiコンポーネント フロント 仕様書 §6、デザイントークン仕様書 §12）。
 * 画面上部中央・ヘッダー直下に表示、3秒で自動消去、×で即時消去、複数件は縦積み、
 * 200ms のフェード。挙動は Radix Toast に任せる。
 *
 * 使い方:
 *   const { toast } = useToast();
 *   toast({ type: 'success', message: 'マイリストに追加しました' });
 */
'use client';

import * as RadixToast from '@radix-ui/react-toast';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from './cn';
import { AlertIcon, CheckIcon, InfoIcon, XIcon } from './icons';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastInput {
  type?: ToastType;
  message: ReactNode;
}

interface ToastItem extends ToastInput {
  id: string;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TYPE_STYLE: Record<ToastType, { border: string; icon: ReactNode; label: string }> = {
  success: { border: 'border-l-toast-success', icon: <CheckIcon size={16} className="text-toast-success" />, label: '成功' },
  error: { border: 'border-l-toast-error', icon: <AlertIcon size={16} className="text-toast-error" />, label: 'エラー' },
  warning: { border: 'border-l-toast-warning', icon: <AlertIcon size={16} className="text-toast-warning" />, label: '警告' },
  info: { border: 'border-l-toast-info', icon: <InfoIcon size={16} className="text-toast-info" />, label: '情報' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((input: ToastInput) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random());
    setItems((prev) => [...prev, { id, type: 'info', ...input }]);
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider duration={3000} swipeDirection="up" label="通知">
        {children}
        {items.map((item) => {
          const style = TYPE_STYLE[item.type ?? 'info'];
          return (
            <RadixToast.Root
              key={item.id}
              onOpenChange={(open) => {
                if (!open) remove(item.id);
              }}
              className={cn(
                'flex items-start gap-3 rounded-[10px] border-[0.5px] border-border-default border-l-4 bg-bg-card px-4 py-3 text-base text-text-primary shadow-elevated',
                'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out data-[swipe=end]:animate-fade-out',
                style.border,
              )}
            >
              <span className="mt-[2px] shrink-0" aria-hidden>
                {style.icon}
              </span>
              <RadixToast.Description className="flex-1">
                <span className="sr-only">{style.label}: </span>
                {item.message}
              </RadixToast.Description>
              <RadixToast.Close aria-label="閉じる" className="shrink-0 p-[2px] text-text-muted hover:text-text-primary">
                <XIcon size={14} />
              </RadixToast.Close>
            </RadixToast.Root>
          );
        })}
        {/* ヘッダー直下: モバイル 52px、PC 60px の下に 12px */}
        <RadixToast.Viewport className="fixed left-1/2 top-[64px] z-[60] flex w-[min(420px,calc(100%-32px))] -translate-x-1/2 flex-col gap-2 outline-none md:top-[72px]" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast は ToastProvider の内側で使ってください');
  return ctx;
}
