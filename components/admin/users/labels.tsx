// ユーザー管理（/admin/users 配下）で使う小さな表示部品
import { StatusBadge } from '@/components/ui/Badge';
import { TAG_BASE_CLASS } from '@/components/ui/Tag';
import { cn } from '@/components/ui/cn';
import type { AccountStatus, UserRoleLabel, WithdrawnBy } from '@/lib/account-status-shared';

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 状態（利用中＝緑／退会済み＝赤）。色だけに頼らないよう文言も添える。退会済みは誰が退会させたかを添える */
export function StatusTag({ status, withdrawnBy }: { status: AccountStatus; withdrawnBy: WithdrawnBy | null }) {
  if (status === 'active') {
    return <span className={cn(TAG_BASE_CLASS, 'border border-brand-watching/40 bg-brand-watching-bg text-brand-watching')}>利用中</span>;
  }
  return (
    <span className={cn(TAG_BASE_CLASS, 'border border-brand-primary/50 bg-brand-primary/15 text-brand-primary')}>
      退会済み{withdrawnBy === 'admin' ? '（運営）' : withdrawnBy === 'self' ? '（本人）' : ''}
    </span>
  );
}

const ROLE_LABEL: Partial<Record<UserRoleLabel, string>> = { owner: 'オーナー', operator: '運営者', ai_operator: 'AI運営者' };

/** 管理者・テスト用会員の印（一般ユーザーは何も出さない） */
export function RoleBadge({ role, isTestUser }: { role: UserRoleLabel; isTestUser: boolean }) {
  const label = ROLE_LABEL[role];
  return (
    <>
      {label && <StatusBadge>{label}</StatusBadge>}
      {isTestUser && <StatusBadge>テスト用会員</StatusBadge>}
    </>
  );
}
