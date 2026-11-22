/**
 * 退会中のアカウントでログインしたときの案内（ページ ログイン アカウント登録・ログイン仕様書 §5.5）。
 * 管理者が退会させたアカウントは、アカウントを残してログインできなくする方式（2026-11-17）。Firebase Auth のアカウントは
 * 無効化しないため、ログイン自体は通り、ここで users/{uid}.accountStatus を見て締め出す。本人では再開できない。
 * 本人の退会は、データごとアカウントを消去する方式に変えた（2026-11-19）ので、再開の確認は無い。
 * 閉じる（×・Esc・外側）は「閉じる」と同じでログアウトする。ルートレイアウトに置き、どのページでも働く。
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export function WithdrawnAccountGate() {
  const { user, role, accountStatus, withdrawnBy } = useAuth();
  const isAdmin = role === 'owner' || role === 'operator';
  const open = !!user && !isAdmin && accountStatus === 'withdrawn';
  // ユーザーが替わったら中身を作り直す（busy などを持ち越さない）
  return open ? <WithdrawnDialog key={user.uid} bySelf={withdrawnBy === 'self'} /> : null;
}

function WithdrawnDialog({ bySelf }: { bySelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'signout' | null>(null);
  async function leave(next?: string) {
    setBusy('signout');
    try {
      await signOut(auth);
    } finally {
      setBusy(null);
    }
    if (next) router.push(next);
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && busy === null && void leave()}
      title={bySelf ? 'このアカウントは退会済みです' : 'このアカウントではログインできません'}
      description={
        bySelf
          ? '以前の方式で退会したアカウントです。利用の再開や、データの消去をご希望の場合は、お問い合わせください。'
          : 'このアカウントは運営により退会の扱いになっています。お心当たりがない場合は、お問い合わせください。'
      }
    >
      <div className="flex flex-wrap justify-end gap-2" data-testid="withdrawn-by-admin">
        <Button variant="ghost" onClick={() => leave()} loading={busy === 'signout'} disabled={busy !== null}>
          閉じる
        </Button>
        <Button variant="secondary" onClick={() => leave('/contact')} disabled={busy !== null}>
          お問い合わせへ
        </Button>
      </div>
    </Modal>
  );
}
