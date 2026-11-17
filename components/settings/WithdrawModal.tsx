/**
 * 退会の確認モーダル（ページ 設定 仕様書 §8.2・§8.3）。
 * 退会はその場で行う（2026-11-17 ユーザー決定。運営の承認は待たない）。アカウントとデータは残し、ログインできなくする。
 * 同じメールアドレス・パスワードでログインすれば、いつでも利用を再開できる（ページ ログイン 仕様書 §5.5）。
 * 理由は任意（選択肢＋自由記述）。退会したらログアウトして TOP へ戻る（§8.4）。
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button, Field, Modal, Textarea, useToast } from '@/components/ui';
import { SELF_WITHDRAW_REASONS, WITHDRAW_REASON_MAX } from '@/lib/account-status-shared';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}

export function WithdrawModal({ open, onOpenChange, user }: Props) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="退会しますか？">
      {open && <WithdrawForm user={user} onClose={() => onOpenChange(false)} />}
    </Modal>
  );
}

function WithdrawForm({ user, onClose }: { user: User; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [choice, setChoice] = useState<string>('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = [choice, detail.trim()].filter(Boolean).join('：');
  const tooLong = reason.length > WITHDRAW_REASON_MAX;

  async function handleWithdraw() {
    if (tooLong) return;
    setBusy(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/account/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error(`withdraw ${res.status}`);
      await signOut(auth);
      toast({ type: 'success', message: '退会しました' });
      router.push('/');
    } catch {
      setError('退会できませんでした。時間をおいて再試行してください');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-base text-text-secondary">
        <p>退会すると、このアカウントではログインできなくなります。</p>
        <p className="mt-2">
          投稿したレビュー・マイリスト・プロフィールは他の人から見えなくなります。データは消えないので、同じメールアドレスとパスワードでログインすれば、いつでも利用を再開できます。
        </p>
      </div>

      <fieldset>
        <legend className="mb-2 text-md text-text-tertiary">退会の理由（任意）</legend>
        <div className="flex flex-col gap-2">
          {SELF_WITHDRAW_REASONS.map((r) => (
            <label key={r} className="flex cursor-pointer items-center gap-2 text-base text-text-primary">
              <input
                type="radio"
                name="withdraw-reason"
                value={r}
                checked={choice === r}
                onChange={() => setChoice(r)}
                disabled={busy}
                className="size-4"
              />
              {r}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="ご意見があればお聞かせください（任意）" error={tooLong ? `${WITHDRAW_REASON_MAX}文字以内で入力してください` : undefined}>
        {(props) => (
          <Textarea {...props} rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} disabled={busy} />
        )}
      </Field>

      {error && (
        <p role="alert" className="text-md text-input-error">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          キャンセル
        </Button>
        <Button variant="primary" onClick={handleWithdraw} loading={busy} disabled={tooLong}>
          退会する
        </Button>
      </div>
    </div>
  );
}
