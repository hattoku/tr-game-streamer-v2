/**
 * 退会中のアカウントでログインしたときの確認（ページ ログイン アカウント登録・ログイン仕様書 §5.5・§5.6）。
 * 退会はアカウントを残してログインできなくする方式（2026-11-17 ユーザー決定）。Firebase Auth のアカウントは無効化しないため、
 * ログイン自体は通り、ここで users/{uid}.accountStatus を見て締め出す。
 * - 本人が退会した: 「アカウントの利用を再開しますか？」。再開なら退会を解除、再開しないならログアウト
 * - 管理者が退会させた: 本人では再開できない。ログインできない旨とお問い合わせの案内を出し、閉じたらログアウト
 * 閉じる（×・Esc・外側）はどちらも「再開しない」と同じ扱い。ルートレイアウトに置き、どのページでも働く。
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

/**
 * 設定ページで本人が退会した直後（ログアウトするまでの一瞬）に、この確認が出ないようにする。
 * components/settings/WithdrawModal.tsx が退会の API を呼ぶ前に、そのユーザーの UID を入れる。ログアウトで消す
 */
let suppressedUid: string | null = null;
export function suppressWithdrawnGateFor(uid: string | null): void {
  suppressedUid = uid;
}

export function WithdrawnAccountGate() {
  const { user, role, accountStatus, withdrawnBy } = useAuth();
  const isAdmin = role === 'owner' || role === 'operator';
  useEffect(() => {
    if (!user) suppressedUid = null;
  }, [user]);
  const open = !!user && !isAdmin && accountStatus === 'withdrawn' && suppressedUid !== user.uid;
  // ユーザーが替わったら中身を作り直す（busy などを持ち越さない）
  return open ? <WithdrawnDialog key={user.uid} byAdmin={withdrawnBy === 'admin'} /> : null;
}

function WithdrawnDialog({ byAdmin }: { byAdmin: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<'resume' | 'signout' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function leave(next?: string) {
    setBusy('signout');
    try {
      await signOut(auth);
    } finally {
      setBusy(null);
    }
    if (next) router.push(next);
  }

  async function resume() {
    const current = auth.currentUser;
    if (!current) return;
    setBusy('resume');
    setError(null);
    try {
      const idToken = await current.getIdToken();
      const res = await fetch('/api/account/resume', { method: 'POST', headers: { Authorization: `Bearer ${idToken}` } });
      if (!res.ok) throw new Error(`resume ${res.status}`);
      // 閉じるのは users の購読（accountStatus が active に戻る）を受けて行う
      toast({ type: 'success', message: 'アカウントの利用を再開しました' });
    } catch {
      setError('再開できませんでした。時間をおいて再試行してください');
      setBusy(null);
    }
  }

  if (byAdmin) {
    return (
      <Modal
        open
        onOpenChange={(o) => !o && busy === null && void leave()}
        title="このアカウントではログインできません"
        description="このアカウントは運営により退会の扱いになっています。お心当たりがない場合は、お問い合わせください。"
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

  return (
    <Modal
      open
      onOpenChange={(o) => !o && busy === null && void leave()}
      title="このアカウントは退会済みです"
      description="アカウントの利用を再開しますか？パスワードはそのまま使えます。レビュー・マイリスト・視聴履歴も退会前のまま戻ります。"
    >
      {error && (
        <p role="alert" className="mb-3 text-md text-input-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2" data-testid="withdrawn-resume">
        <Button variant="ghost" onClick={() => leave()} loading={busy === 'signout'} disabled={busy !== null}>
          再開しない（ログアウト）
        </Button>
        <Button variant="primary" onClick={resume} loading={busy === 'resume'} disabled={busy !== null}>
          利用を再開する
        </Button>
      </div>
    </Modal>
  );
}
