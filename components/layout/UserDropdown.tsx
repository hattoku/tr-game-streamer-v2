/**
 * ヘッダーのユーザードロップダウン（共通 uiコンポーネント フロント 仕様書 §2.6）。
 * ユーザーアイコン（24px 円形、未設定時はイニシャル。デザイントークン仕様書 v2.0 §14）＋ユーザー名をピルに収め、クリックで
 * ユーザー名・メール（表示専用）／プロフィール／設定／ログアウト を表示する。
 * ログアウト後は TOP へ遷移する。
 * 管理者には審査中のワークフロー件数をアイコン右上と「管理画面」項目に出す（§2.10）。
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
import { USER_NAV } from './nav';
import { formatBadgeCount, usePendingWorkflowCount } from '@/components/admin/usePendingWorkflowCount';

export function UserAvatar({
  name,
  imageUrl,
  size = 28,
  className,
}: {
  name: string;
  /** 未設定・取得失敗時はイニシャル表示にフォールバックする（レビュー一覧等） */
  imageUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={cn('inline-block shrink-0 rounded-full object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }
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

export function UserDropdown() {
  const { user, displayName, role } = useAuth();
  const router = useRouter();
  const isAdmin = !!user && (role === 'owner' || role === 'operator');
  const pendingCount = usePendingWorkflowCount(isAdmin);
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
        aria-label={pendingCount > 0 ? `ユーザーメニュー（未処理の審査 ${pendingCount} 件）` : 'ユーザーメニュー'}
        className={cn(
          'relative inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/4 py-1 pl-1 pr-[10px] text-text-tertiary',
          'transition-[color,border-color,background-color] duration-[120ms] hover:border-border-control hover:text-text-primary',
          'data-[state=open]:border-border-control data-[state=open]:text-text-primary',
        )}
      >
        <UserAvatar name={name} size={24} />
        {/* 表示名は 1024px 以上でのみ。768〜1023px はヘッダーに収まらないためアイコン＋▾ だけにする（UI仕様書 §2.9） */}
        <span className="hidden max-w-[6em] truncate text-base text-text-primary lg:inline">{name}</span>
        <ChevronDownIcon size={12} />
        {pendingCount > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-[8px] bg-brand-primary px-1 text-xs font-semibold leading-none text-white shadow-[0_0_0_2px_var(--color-bg-base)]"
          >
            {formatBadgeCount(pendingCount)}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel className="py-2">
          <span className="block truncate text-base text-text-primary">{name}</span>
          {user.email && <span className="block truncate text-md text-text-muted">{user.email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* マイリスト／視聴履歴: 768〜1023px ではヘッダーの文字リンクを出せないため、ここからも辿れるようにする（UI仕様書 §2.6） */}
        {USER_NAV.map((item) => (
          <DropdownMenuItem key={item.href} onSelect={() => router.push(item.href)}>
            {item.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(`/profile/${user.uid}`)}>プロフィール</DropdownMenuItem>
        {/* 自分のまとめ一覧（まとめ機能仕様書 §4.1。プロフィールのまとめセクションは公開まとめのみのため、非公開を含む管理画面として残す） */}
        <DropdownMenuItem onSelect={() => router.push('/collections/mine')}>自分のまとめ</DropdownMenuItem>
        {/* 保存したまとめ（まとめ機能仕様書 §8.3。仕様のヘッダーリンクの代わりにメニューに置く） */}
        <DropdownMenuItem onSelect={() => router.push('/collections/saved')}>保存したまとめ</DropdownMenuItem>
        {/* 提案履歴（ページ 再生リストを追加する 仕様書 §9.4） */}
        <DropdownMenuItem onSelect={() => router.push('/playlists/proposals')}>提案履歴</DropdownMenuItem>
        {/* お問い合わせ履歴（ページ お問い合わせ履歴 仕様書 §2。設定ページ経由だけでは分かりにくいため追加） */}
        <DropdownMenuItem onSelect={() => router.push('/contact/history')}>お問い合わせ履歴</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push('/settings')}>設定</DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            {/* 管理者（オーナー・運営者）のみ。フェーズ6ステップ3 管理画面（/admin）への導線 */}
            <DropdownMenuItem onSelect={() => router.push('/admin')}>
              <span className="flex w-full items-center justify-between gap-2">
                管理画面
                {pendingCount > 0 && <span className="text-md text-text-muted">未処理 {formatBadgeCount(pendingCount)}</span>}
              </span>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut}>ログアウト</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
