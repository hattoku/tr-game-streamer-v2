/**
 * マイページ（/mypage）。ページ マイページ 仕様書 準拠。
 * スマホのボトムタブ「マイページ」の遷移先で、自分専用のページ（視聴履歴・通知・提案履歴・お問い合わせ履歴・設定・管理画面）
 * への入口を項目一覧で並べる（2026-11-14 ユーザー決定。それまでは暫定で視聴履歴へ飛ばしていた）。
 * 一番上は自分のアイコン・表示名・メールで、押すとプロフィール（他の人にも見えるページ）へ。一番下にログアウト。
 * マイリストはボトムタブ、サポート・規約は左上メニューにあるため、ここには重ねて置かない。
 * PC はヘッダーのユーザードロップダウンが同じ役割を担うが、URL を直接開けば PC でも表示できる。
 */
'use client';

import Link from 'next/link';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardDivider, SectionHeading } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import {
  BellIcon,
  ChevronRightIcon,
  CommentIcon,
  HistoryIcon,
  LogoutIcon,
  SendIcon,
  SettingsIcon,
  ShieldIcon,
} from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { UserAvatar } from '@/components/layout/UserDropdown';
import { formatBadgeCount, usePendingWorkflowCount } from '@/components/admin/usePendingWorkflowCount';

type IconComponent = ComponentType<{ size?: number; className?: string }>;

interface MenuItem {
  label: string;
  href: string;
  icon: IconComponent;
  /** 行の右側（矢印の手前）に出す補足。未処理件数など */
  trailing?: ReactNode;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

export default function MyPage() {
  const { user, displayName, role, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const isAdmin = !!user && (role === 'owner' || role === 'operator');
  const pendingCount = usePendingWorkflowCount(isAdmin);

  // 未ログインはログインページへ（ボトムタブからはアカウント作成へ飛ぶので、ここに来るのは URL を直接開いたときだけ）
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return <MyPageSkeleton />;

  const name = displayName ?? user.email?.split('@')[0] ?? 'ユーザー';

  const groups: MenuGroup[] = [
    {
      title: '見る',
      items: [
        { label: '視聴履歴', href: '/history', icon: HistoryIcon },
        { label: '通知', href: '/notifications', icon: BellIcon },
      ],
    },
    {
      title: '自分の投稿・やりとり',
      items: [
        { label: '提案履歴', href: '/playlists/proposals', icon: SendIcon },
        { label: 'お問い合わせ履歴', href: '/contact/history', icon: CommentIcon },
      ],
    },
    {
      title: 'アカウント',
      items: [{ label: '設定', href: '/settings', icon: SettingsIcon }],
    },
  ];
  if (isAdmin) {
    groups.push({
      title: '運営',
      items: [
        {
          label: '管理画面',
          href: '/admin',
          icon: ShieldIcon,
          trailing: pendingCount > 0 ? <span className="text-md text-text-muted">未処理 {formatBadgeCount(pendingCount)}</span> : undefined,
        },
      ],
    });
  }

  // 確認ダイアログなし、押したらすぐログアウト（設定ページ・ユーザードロップダウンと同じ）
  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut(auth);
      router.push('/');
    } catch {
      toast({ type: 'error', message: 'ログアウトに失敗しました' });
      setSigningOut(false);
    }
  }

  return (
    <div>
      <SectionHeading className="mb-5">マイページ</SectionHeading>

      <div className="flex flex-col gap-6">
        {/* 自分のアイコン・名前。押すとプロフィール（公開ページ。表示名・自己紹介の編集もここ） */}
        <Link href={`/profile/${user.uid}`} className="block rounded-[12px]" data-testid="mypage-profile">
          <Card interactive className="flex items-center gap-3">
            <UserAvatar name={name} size={48} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-medium text-text-primary">{name}</p>
              {user.email && <p className="truncate text-md text-text-muted">{user.email}</p>}
              <p className="mt-1 text-md text-text-secondary">プロフィールを見る</p>
            </div>
            <ChevronRightIcon size={18} className="shrink-0 text-text-muted" />
          </Card>
        </Link>

        {groups.map((group) => (
          <section key={group.title} aria-labelledby={`mypage-${group.title}`}>
            <h2 id={`mypage-${group.title}`} className="mb-2 px-1 text-md font-medium text-text-muted">
              {group.title}
            </h2>
            <Card flush>
              <ul>
                {group.items.map((item, i) => (
                  <li key={item.href}>
                    {/* 区切り線はアイコンの右（左パディング18＋アイコン20＋間隔16px）から */}
                    {i > 0 && <CardDivider className="ml-[54px]" />}
                    <MenuRow {...item} />
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))}

        <Card flush>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className={rowClass('w-full text-left disabled:opacity-60')}
          >
            <LogoutIcon size={20} className="shrink-0 text-text-muted" />
            <span className="flex-1 text-lg text-text-primary">{signingOut ? 'ログアウト中…' : 'ログアウト'}</span>
          </button>
        </Card>
      </div>
    </div>
  );
}

function rowClass(extra?: string) {
  return cn('flex min-h-14 items-center gap-4 px-[18px] py-3 transition-colors duration-[120ms] hover:bg-bg-hover', extra);
}

function MenuRow({ label, href, icon: Icon, trailing }: MenuItem) {
  return (
    <Link href={href} className={rowClass()}>
      <Icon size={20} className="shrink-0 text-text-muted" />
      <span className="flex-1 text-lg text-text-primary">{label}</span>
      {trailing}
      <ChevronRightIcon size={16} className="shrink-0 text-text-muted" />
    </Link>
  );
}

function MyPageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="読み込み中">
      <Skeleton className="h-6 w-[120px]" />
      <Skeleton className="h-[84px] w-full rounded-[12px]" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-[112px] w-full rounded-[12px]" />
      ))}
    </div>
  );
}
