/**
 * ヘッダーのユーザードロップダウン（共通 uiコンポーネント フロント 仕様書 §2.6）。
 * ユーザーアイコン（28px 円形、未設定時はイニシャル。デザイントークン仕様書 §14）＋ユーザー名をクリックで
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
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-bg-btn text-text-tertiary', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
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
      <DropdownMenuTrigger
        aria-label="ユーザーメニュー"
        className="inline-flex items-center gap-1 rounded-full text-text-tertiary transition-colors duration-[120ms] hover:text-text-primary data-[state=open]:text-text-primary"
      >
        <UserAvatar name={name} size={compact ? 20 : 28} />
        <span className={cn('max-w-[6em] truncate text-text-secondary', compact ? 'text-md' : 'text-base')}>{name}</span>
        <ChevronDownIcon size={compact ? 10 : 14} />
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
