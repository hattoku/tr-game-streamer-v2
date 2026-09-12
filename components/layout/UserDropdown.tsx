/**
 * ヘッダーのユーザードロップダウン（共通 uiコンポーネント フロント 仕様書 §2.6）。
 * ユーザーアイコン（24px 円形、未設定時はイニシャル。デザイントークン仕様書 v2.0 §14）＋ユーザー名をピルに収め、クリックで
 * ユーザー名・メール（表示専用）／プロフィール／設定／ログアウト を表示する。
 * ログアウト後は TOP へ遷移する。
 */
'use client';

import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { ChevronDownIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';

export function UserAvatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-bg-selected font-semibold text-text-primary', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
    >
      {initial}
    </span>
  );
}

export function UserDropdown({ compact = false }: { compact?: boolean }) {
  const { user, displayName } = useAuth();
  const router = useRouter();
  if (!user) return null;

  const name = displayName ?? user.email?.split('@')[0] ?? 'ユーザー';

  async function handleSignOut() {
    await signOut(auth);
    router.push('/');
  }

  return (
    <DropdownMenu>
      {/* ピル（トークン仕様書 v2.0 §14「ユーザーエリア」）: アイコン＋名前＋▾ */}
      <DropdownMenuTrigger
        aria-label="ユーザーメニュー"
        className={cn(
          'inline-flex items-center rounded-full border border-white/10 bg-white/4 text-text-tertiary',
          'transition-[color,border-color,background-color] duration-[120ms] hover:border-border-control hover:text-text-primary',
          'data-[state=open]:border-border-control data-[state=open]:text-text-primary',
          compact ? 'gap-1 py-[2px] pl-[2px] pr-[6px]' : 'gap-2 py-1 pl-1 pr-[10px]',
        )}
      >
        <UserAvatar name={name} size={compact ? 18 : 24} />
        <span className={cn('max-w-[6em] truncate text-text-primary', compact ? 'text-md' : 'text-base')}>{name}</span>
        <ChevronDownIcon size={compact ? 10 : 12} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel className="py-2">
          <span className="block truncate text-base text-text-primary">{name}</span>
          {user.email && <span className="block truncate text-md text-text-muted">{user.email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(`/profile/${user.uid}`)}>プロフィール</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push('/settings')}>設定</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut}>ログアウト</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
