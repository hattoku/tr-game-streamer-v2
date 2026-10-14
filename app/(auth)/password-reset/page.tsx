'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { FirebaseError } from 'firebase/app';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { AlertIcon } from '@/components/ui/icons';

// パスワード再発行フォーム。
// document/specification/page/ページ ログイン アカウント登録・ログイン仕様書.md §9.1・§9.2・§12.4。
// - メール送信は Firebase の sendPasswordResetEmail。リンク先の「新しいパスワードを入力する画面」は
//   Firebase 標準のホスト画面を使う（2026-10-14 ユーザー決定。自前の /reset-password は作らない）
// - 入力したメールアドレスが未登録でも送信済み画面を出し、登録有無を明かさない（§9.2）
// - メール文面・有効期限は Firebase Console のテンプレート設定側（§9.3 の自前文面は未対応）

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENT_MESSAGE =
  'ご入力のメールアドレスが登録されている場合、パスワード再設定用のリンクをお送りしました。メールに記載のリンクから、新しいパスワードを設定してください。メールが届かない場合は、迷惑メールフォルダもご確認ください。';
const LINK_CLASS = 'text-text-primary underline underline-offset-[3px] hover:text-text-secondary';

export default function PasswordResetPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    const trimmed = email.trim();
    if (!trimmed) return setEmailError('入力してください');
    if (!EMAIL_RE.test(trimmed)) return setEmailError('正しいメールアドレスの形式で入力してください');
    setEmailError(undefined);

    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setSent(true);
    } catch (e) {
      const code = e instanceof FirebaseError ? e.code : '';
      if (code === 'auth/user-not-found') {
        // 登録有無を明かさないため、成功時と同じ画面を出す
        setSent(true);
      } else if (code === 'auth/invalid-email') {
        setEmailError('正しいメールアドレスの形式で入力してください');
        setBusy(false);
      } else {
        const message =
          code === 'auth/too-many-requests'
            ? '試行回数が多すぎます。しばらく待ってから再試行してください'
            : code === 'auth/network-request-failed'
              ? '通信エラーが発生しました。時間をおいて再試行してください'
              : 'メールの送信に失敗しました。時間をおいて再試行してください';
        setFormError(message);
        if (code !== 'auth/too-many-requests') toast({ type: 'error', message });
        setBusy(false);
      }
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeading className="text-center">パスワード再設定メールを送信しました</SectionHeading>
        <p role="status" className="text-md text-text-secondary">
          {SENT_MESSAGE}
        </p>
        <p className="text-center text-base text-text-muted">
          <Link href="/login" className={LINK_CLASS}>
            ログインページへ戻る
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
      <SectionHeading className="text-center">パスワードを再設定する</SectionHeading>
      <p className="text-md text-text-secondary">
        登録済みのメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。
      </p>

      {formError && (
        <p role="alert" className="flex items-start gap-[6px] text-md text-input-error">
          <AlertIcon size={14} className="mt-[2px] shrink-0" />
          <span>{formError}</span>
        </p>
      )}

      <Field label="メールアドレス" error={emailError}>
        {(props) => (
          <Input
            {...props}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="example@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        )}
      </Field>

      <Button type="submit" variant="primary" size="full" loading={busy} className="mt-1">
        パスワード再設定メールを送信する
      </Button>

      <p className="text-center text-base text-text-muted">
        <Link href="/login" className={LINK_CLASS}>
          ログインページへ戻る
        </Link>
      </p>
    </form>
  );
}
