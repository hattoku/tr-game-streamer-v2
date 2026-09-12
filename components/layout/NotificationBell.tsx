/**
 * ヘッダーの通知ベル（ページ ユーザー通知機能仕様書 §4.1、デザイントークン仕様書 v2.0 §15.1）。
 * ログイン済みのみ表示。未読件数を `notifications`（userId == 自分 && isRead == false）の onSnapshot で
 * 数え、赤い件数バッジで出す（99件超は「99+」）。通知一覧で既読にすると即座に減る。
 * クリックで通知一覧 `/notifications` へ（通知ドロップダウン §4.2 はフェーズ2.5では見送り）。
 * 通知一覧への唯一の導線なので PC・モバイル共に表示する（UIコンポーネント仕様書 §2.7）。
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { BellIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { isActivePath } from './nav';

export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid), where('isRead', '==', false));
    return onSnapshot(
      q,
      (snap) => setUnread(snap.size),
      () => setUnread(0),
    );
  }, [user]);

  if (!user) return null;

  const active = isActivePath(pathname, '/notifications');
  const label = unread > 0 ? `通知（未読 ${unread} 件）` : '通知';

  return (
    <Link
      href="/notifications"
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex items-center justify-center rounded-full transition-colors duration-[120ms] hover:text-text-primary',
        compact ? 'size-6' : 'size-9',
        active ? 'text-text-primary' : 'text-text-tertiary',
      )}
    >
      <BellIcon size={compact ? 14 : 20} />
      {unread > 0 && (
        <span
          aria-hidden
          className={cn(
            'absolute inline-flex items-center justify-center rounded-[8px] bg-brand-primary px-1 text-xs font-semibold leading-none text-white',
            'shadow-[0_0_0_2px_var(--color-bg-base)]',
            compact ? 'right-0 top-0 h-[14px] min-w-[14px] text-[9px]' : 'right-0 top-0 h-4 min-w-4',
          )}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
