/**
 * モバイル版ハンバーガーメニュー（共通 uiコンポーネント フロント 仕様書 §2.7「ハンバーガーメニュー」、
 * デザイントークン仕様書 §13.2）。
 * 主要導線はボトムタブバーが担うため、ここには サポート系リンク／法的リンク／コピーライト だけを置く
 * （モバイルではフッターを表示しないので、その代替）。左からスライドインするドロワー。
 * フォーカス閉じ込め・Esc・オーバーレイクリック・スクロール固定は Radix Dialog が担う。
 */
'use client';

import * as Dialog from '@radix-ui/react-dialog';
import Link from 'next/link';
import { useState } from 'react';
import { Logo } from '@/components/ui/Logo';
import { MenuIcon, XIcon } from '@/components/ui/icons';
import { COPYRIGHT, FOOTER_LEGAL_NAV, FOOTER_SUPPORT_NAV, type NavItem } from './nav';

function LinkGroup({ title, items, onNavigate }: { title: string; items: NavItem[]; onNavigate: () => void }) {
  return (
    <div>
      <p className="mb-1 text-md font-medium text-text-muted">{title}</p>
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} onClick={onNavigate} className="flex h-11 items-center text-lg text-text-primary hover:text-text-secondary">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MobileMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="メニューを開く"
        className={
          'inline-flex size-10 items-center justify-center rounded-[6px] text-text-secondary transition-colors duration-[120ms] hover:text-text-primary ' +
          (className ?? '')
        }
      >
        <MenuIcon size={22} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <Dialog.Content className="fixed left-0 top-0 z-50 flex h-dvh w-[min(300px,85vw)] flex-col overflow-y-auto border-r-[0.5px] border-surface-border bg-surface-elevated p-5 outline-none data-[state=open]:animate-slide-in-left data-[state=closed]:animate-slide-out-left">
          <Dialog.Title className="sr-only">メニュー</Dialog.Title>
          <Dialog.Description className="sr-only">サポート情報と法的情報へのリンク</Dialog.Description>
          <div className="flex items-center justify-between">
            <Logo />
            <Dialog.Close aria-label="メニューを閉じる" className="inline-flex size-10 items-center justify-center rounded-[6px] text-text-muted hover:text-text-primary">
              <XIcon size={22} />
            </Dialog.Close>
          </div>

          <div className="mt-6 flex flex-col gap-5">
            <LinkGroup title="サポート" items={FOOTER_SUPPORT_NAV} onNavigate={close} />
            <div className="border-t-[0.5px] border-border-subtle" />
            <LinkGroup title="規約・ポリシー" items={FOOTER_LEGAL_NAV} onNavigate={close} />
          </div>

          <p className="mt-auto pt-8 text-md text-text-faint">{COPYRIGHT}</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
