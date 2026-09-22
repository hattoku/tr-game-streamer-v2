/**
 * 管理画面（/admin配下）のレイアウト。管理_ダッシュボード仕様書 §1.1「アクセス条件」に基づき
 * オーナー・運営者のみ許可する。403ページは未実装のため、非管理者は一般ユーザーの同意なきアクセスを
 * 避ける目的でTOPへ戻す（EmptyStateではなくリダイレクトとしたのは、/adminがフロント向けページの一部
 * ではなく完全に別の管理者専用領域のため）。
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { CenteredSpinner } from '@/components/ui/Spinner';
import { AdminFrame } from '@/components/admin/AdminFrame';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const isAdmin = role === 'owner' || role === 'operator';

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!isAdmin) {
      router.replace('/');
    }
  }, [loading, user, isAdmin, router]);

  if (loading || !user || !isAdmin) {
    return <CenteredSpinner />;
  }

  return <AdminFrame>{children}</AdminFrame>;
}
