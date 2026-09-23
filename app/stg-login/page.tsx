'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/Card';
import { Field, PasswordInput } from '@/components/ui/Input';
import { CenteredSpinner } from '@/components/ui/Spinner';
import { AlertIcon } from '@/components/ui/icons';

// 全環境（本番含む、検証段階のため）を保護するCookieゲートのログインページ。proxy.ts が
// 未認証アクセスをここへリダイレクトする。Firebase Auth（/login）とは無関係の別物。

function StgLoginBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // オープンリダイレクト対策: サイト内の絶対パスのみ許可する（外部URL・プロトコル相対URLは拒否）
  const rawRedirect = searchParams.get('redirect');
  const redirectTo = rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/';

  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) {
      setFieldError('入力してください');
      return;
    }

    setBusy(true);
    setFieldError(undefined);
    setFormError(undefined);
    try {
      const res = await fetch('/api/stg-gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setFormError('パスワードが正しくありません');
        setBusy(false);
        return;
      }
      router.replace(redirectTo);
    } catch {
      setFormError('通信エラーが発生しました。時間をおいて再試行してください');
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
      <SectionHeading className="text-center">パスワードを入力してください</SectionHeading>

      {formError && (
        <p role="alert" className="flex items-start gap-[6px] text-md text-input-error">
          <AlertIcon size={14} className="mt-[2px] shrink-0" />
          <span>{formError}</span>
        </p>
      )}

      <Field label="パスワード" error={fieldError}>
        {(props) => (
          <PasswordInput
            {...props}
            name="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        )}
      </Field>

      <Button type="submit" variant="primary" size="full" loading={busy} className="mt-1">
        入室する
      </Button>
    </form>
  );
}

export default function StgLoginPage() {
  return (
    <AuthLayout>
      <Suspense fallback={<CenteredSpinner />}>
        <StgLoginBody />
      </Suspense>
    </AuthLayout>
  );
}
