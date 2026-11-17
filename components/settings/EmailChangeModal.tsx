/**
 * メールアドレス変更モーダル（ページ 設定 仕様書 §4.3）。
 *
 * 流れ: 入力チェック → 現在のパスワードで本人確認（reauthenticateWithCredential） → すでに使われていないかを API で確認
 * （/api/account/email/check。Firebase の列挙保護でクライアントからは分からないため） → verifyBeforeUpdateEmail で
 * 新しいアドレスへ確認メールを送る → 「確認メールを送信しました」を表示。
 * リンクを開くと /auth/action（app/(auth)/auth/action）で変更が完了し、ログイン中の端末はログアウトされる（Firebase の仕様）。
 * 全体の流れが分かるよう、上部に「① 申し込む → ② メールのリンクを開く → ③ ログインし直す」を出す（2026-11-17 ユーザー要望）。
 * 現在のパスワード欄は仕様書に無かったが、Firebase が直前の本人確認を求めるため追加した（2026-11-17 ユーザー決定）。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { FirebaseError } from 'firebase/app';
import { EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button, Field, Input, Modal, PasswordInput } from '@/components/ui';
import { AlertIcon } from '@/components/ui/icons';
import { EMAIL_CHANGE_STEPS, ProposalSteps } from '@/components/playlists/ProposalSteps';
import { EMAIL_CHANGE_MESSAGES as M, validateEmailChange, type EmailChangeErrors } from '@/lib/email-change-shared';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}

type Errors = EmailChangeErrors & { form?: string };

export function EmailChangeModal({ open, onOpenChange, user }: Props) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="メールアドレスを変更する">
      {/* 開くたびに入力と結果を捨てる */}
      {open && <EmailChangeForm user={user} onClose={() => onOpenChange(false)} />}
    </Modal>
  );
}

function EmailChangeForm({ user, onClose }: { user: User; onClose: () => void }) {
  const [newEmail, setNewEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateEmailChange({ newEmail, confirmEmail, password, currentEmail: user.email });
    setErrors(found);
    if (Object.keys(found).length > 0 || !user.email) return;

    const email = newEmail.trim();
    setBusy(true);
    try {
      // 1. 本人確認（直前のログインを求める Firebase の条件もこれで満たす）
      try {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      } catch (e) {
        const code = e instanceof FirebaseError ? e.code : '';
        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/invalid-login-credentials') {
          setErrors({ password: M.wrongPassword });
          return;
        }
        throw e;
      }

      // 2. すでに使われていないか
      const idToken = await user.getIdToken();
      const res = await fetch('/api/account/email/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ newEmail: email }),
      });
      if (res.status === 429) return setErrors({ form: M.tooManyRequests });
      if (res.status === 400) return setErrors({ newEmail: M.invalidEmail });
      if (!res.ok) return setErrors({ form: M.generic });
      const { available } = (await res.json()) as { available: boolean };
      if (!available) return setErrors({ newEmail: M.alreadyInUse });

      // 3. 確認メールを送る（Firebase のメールテンプレートを日本語で）
      auth.languageCode = 'ja';
      await verifyBeforeUpdateEmail(user, email);
      setSentTo(email);
    } catch (e) {
      const code = e instanceof FirebaseError ? e.code : '';
      if (code === 'auth/email-already-in-use') setErrors({ newEmail: M.alreadyInUse });
      else if (code === 'auth/invalid-email' || code === 'auth/invalid-new-email') setErrors({ newEmail: M.invalidEmail });
      else if (code === 'auth/too-many-requests') setErrors({ form: M.tooManyRequests });
      else if (code === 'auth/network-request-failed') setErrors({ form: M.network });
      else setErrors({ form: M.generic });
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div>
        <EmailChangeSteps current={2} />
        <p className="text-base font-medium text-text-primary">確認メールを送信しました</p>
        <p className="mt-2 text-md text-text-secondary">
          <span className="break-all text-text-primary">{sentTo}</span>{' '}
          宛てに確認メールをお送りしました。メールに記載のリンクを開くと、メールアドレスの変更が完了します。
        </p>
        <p className="mt-2 text-md text-text-muted">
          変更が完了するとログアウトされるので、新しいメールアドレスでログインし直してください。メールが届かない場合は、迷惑メールフォルダもご確認ください。
        </p>
        <div className="mt-5 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            閉じる
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <EmailChangeSteps current={1} />
        <p className="text-md text-text-secondary">
          新しいメールアドレスに確認メールが届きます。メールのリンクを開くと変更が完了するので、新しいメールアドレスでログインし直してください。
        </p>
      </div>
      {errors.form && (
        <p role="alert" className="flex items-start gap-2 text-md text-input-error">
          <AlertIcon size={16} className="mt-[2px] shrink-0" />
          {errors.form}
        </p>
      )}
      <p className="text-md text-text-muted">
        現在のメールアドレス: <span className="break-all text-text-secondary">{user.email}</span>
      </p>
      <Field label="新しいメールアドレス" error={errors.newEmail}>
        {(a11y) => (
          <Input {...a11y} type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        )}
      </Field>
      <Field label="新しいメールアドレス（確認用）" error={errors.confirmEmail}>
        {(a11y) => (
          <Input
            {...a11y}
            type="email"
            autoComplete="off"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
          />
        )}
      </Field>
      <Field label="現在のパスワード" error={errors.password} hint="本人確認のため、いまのパスワードを入力してください">
        {(a11y) => (
          <PasswordInput {...a11y} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
      </Field>
      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          キャンセル
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          変更メールを送信する
        </Button>
      </div>
    </form>
  );
}

/** 変更の流れ（① 申し込む → ② メールのリンクを開く → ③ ログインし直す）。今いる段を強調する */
function EmailChangeSteps({ current }: { current: 1 | 2 }) {
  return (
    <ProposalSteps
      current={current}
      labels={EMAIL_CHANGE_STEPS}
      ariaLabel="メールアドレス変更の流れ"
      testId="email-change-steps"
      className="mb-4"
    />
  );
}
