'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/Card';
import { Checkbox, Field, Input, PasswordInput } from '@/components/ui/Input';
import { CenteredSpinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { AlertIcon } from '@/components/ui/icons';
import { SIGNUP_HREF } from '@/components/layout/nav';

// ログイン／アカウント作成ページ。
// document/specification/page/ページ ログイン アカウント登録・ログイン仕様書.md のうち
// メール・パスワード部分（§5 フォーム、§5.3 エラー、§8.1 作成フォーム、§8.2 バリデーション、§12.1・§12.2 レイアウト）。
// フェーズ2.5ステップ7でデザイン適用（wiki/sources/2026-09-12-login-and-register-design-plan.md）。
// - `?mode=signup`（components/layout/nav.ts の SIGNUP_HREF）でアカウント作成モード。/signup 専用ページは
//   フェーズ3以降のため、当面はこのページ内のモード切替で代替する
// - ログイン成功後は全員 TOP へ（§5.4 の管理者 /admin 分岐は管理画面ができるまで据え置き）
// - ログアウトはヘッダーのユーザードロップダウン（components/layout/UserDropdown.tsx）
// 据え置き（HANDOFF.md 未解決事項 8・9、および計画書 §2.2）:
// - 「パスワードをお忘れの方はこちら」（§5.1・§9）: /password-reset 未実装のためリンクを置かない
// - 「ログイン状態を維持する」（§5.2: 24時間/7日）: クライアント SDK では有効期限を指定できないため置かない
// - ソーシャルログイン・パスキー・メール認証・初期設定フロー（§6〜§10）

type Mode = 'login' | 'signup';

interface FieldErrors {
  email?: string;
  password?: string;
  passwordConfirm?: string;
  /** フォーム上部に出す、特定フィールドに紐づかないエラー */
  form?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUIRED = '入力してください';
const INVALID_EMAIL = '正しいメールアドレスの形式で入力してください';
const SHORT_PASSWORD = 'パスワードは8文字以上で入力してください';

/** Firebase Auth のエラーコードを仕様書の文言（§5.3・§8.2）に対応づける。無いものは汎用文（generic: トーストも出す） */
function mapAuthError(e: unknown, mode: Mode): { errors: FieldErrors; generic: boolean } {
  const code = e instanceof FirebaseError ? e.code : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return { errors: { form: 'メールアドレスまたはパスワードが正しくありません' }, generic: false };
    case 'auth/email-already-in-use':
      return { errors: { email: 'このメールアドレスはすでに登録されています' }, generic: false };
    case 'auth/invalid-email':
      return { errors: { email: INVALID_EMAIL }, generic: false };
    case 'auth/weak-password':
      return { errors: { password: SHORT_PASSWORD }, generic: false };
    case 'auth/too-many-requests':
      return { errors: { form: '試行回数が多すぎます。しばらく待ってから再試行してください' }, generic: false };
    case 'auth/network-request-failed':
      return { errors: { form: '通信エラーが発生しました。時間をおいて再試行してください' }, generic: true };
    default:
      return {
        errors: {
          form:
            mode === 'signup'
              ? 'アカウントの作成に失敗しました。時間をおいて再試行してください'
              : 'ログインに失敗しました。時間をおいて再試行してください',
        },
        generic: true,
      };
  }
}

export default function LoginPage() {
  // useSearchParams を使うコンポーネントは Suspense 境界の内側に置く（Next.js の規約）
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <LoginPageBody />
    </Suspense>
  );
}

function LoginPageBody() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode: Mode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';

  // ログイン済みでこのページに来た場合は TOP へ戻す
  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  if (loading || user) return <CenteredSpinner />;

  // モードが変わったら入力とエラーをすべて捨てる（key で作り直す）
  return <LoginForm key={mode} mode={mode} />;
}

function LoginForm({ mode }: { mode: Mode }) {
  const { refreshRole } = useAuth();
  const { toast } = useToast();
  const isSignup = mode === 'signup';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) next.email = REQUIRED;
    else if (!EMAIL_RE.test(trimmedEmail)) next.email = INVALID_EMAIL;

    if (!password) next.password = REQUIRED;
    else if (isSignup && password.length < 8) next.password = SHORT_PASSWORD;

    if (isSignup) {
      if (!passwordConfirm) next.passwordConfirm = REQUIRED;
      else if (passwordConfirm !== password) next.passwordConfirm = 'パスワードが一致しません';
    }
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      if (isSignup) {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const idToken = await credential.user.getIdToken();
        const res = await fetch('/api/auth/init-user', {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) throw new Error('init-user failed');
        await refreshRole();
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      // 成功後の遷移は AuthContext の user 更新を受けて LoginPageBody が行う
    } catch (e) {
      const { errors: mapped, generic } = mapAuthError(e, mode);
      setErrors(mapped);
      if (generic && mapped.form) toast({ type: 'error', message: mapped.form });
      setBusy(false);
    }
  }

  const submitDisabled = isSignup && !ageConfirmed;

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
      <SectionHeading className="text-center">{isSignup ? 'アカウントを作成する' : 'ログイン'}</SectionHeading>

      {errors.form && (
        <p role="alert" className="flex items-start gap-[6px] text-md text-input-error">
          <AlertIcon size={14} className="mt-[2px] shrink-0" />
          <span>{errors.form}</span>
        </p>
      )}

      <Field label="メールアドレス" error={errors.email}>
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

      <Field label="パスワード" error={errors.password} hint={isSignup ? '8文字以上' : undefined}>
        {(props) => (
          <PasswordInput
            {...props}
            name="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        )}
      </Field>

      {isSignup && (
        <>
          <Field label="パスワード（確認）" error={errors.passwordConfirm}>
            {(props) => (
              <PasswordInput
                {...props}
                name="password-confirm"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                disabled={busy}
              />
            )}
          </Field>
          {/* 必須。未チェックの間は送信ボタンを非活性にし、エラー文言は出さない（§8.2） */}
          <Checkbox
            label="私は13歳以上です"
            checked={ageConfirmed}
            onChange={(e) => setAgeConfirmed(e.target.checked)}
            disabled={busy}
          />
        </>
      )}

      <Button type="submit" variant="primary" size="full" loading={busy} disabled={submitDisabled} className="mt-1">
        {isSignup ? 'アカウントを作成する' : 'ログインする'}
      </Button>

      <p className="text-center text-base text-text-muted">
        {isSignup ? (
          <Link href="/login" className="text-text-primary underline underline-offset-[3px] hover:text-text-secondary">
            すでにアカウントをお持ちの方はこちら
          </Link>
        ) : (
          <Link href={SIGNUP_HREF} className="text-text-primary underline underline-offset-[3px] hover:text-text-secondary">
            アカウントをお持ちでない方はこちら
          </Link>
        )}
      </p>
    </form>
  );
}
