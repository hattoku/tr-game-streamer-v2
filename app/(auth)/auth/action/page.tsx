'use client';

import { Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  sendPasswordResetEmail,
  signOut,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { normalizeEmail } from '@/lib/email-change-shared';
import {
  AUTH_ACTION_MESSAGES as M,
  isInvalidLinkError,
  MIN_PASSWORD_LENGTH,
  parseAuthActionParams,
  retryGuide,
  validateNewPassword,
  type AuthActionMode,
  type AuthActionParams,
  type NewPasswordErrors,
} from '@/lib/auth-action-shared';
import { Button, LinkButton } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/Card';
import { Field, PasswordInput } from '@/components/ui/Input';
import { CenteredSpinner } from '@/components/ui/Spinner';
import { AlertIcon, CheckIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';

// メール内リンクの受け口（ページ ログイン アカウント登録・ログイン仕様書 §9.4、2026-11-17 追加）。
// Firebase 標準のホスト画面（白地にロゴなし）がフィッシングに見えるため、プレミテの認証画面のレイアウトで
// Firebase のメール操作を自前で処理する。Firebase Console のテンプレート設定で「アクション URL」を
// `https://<このサイト>/auth/action` にすると、全テンプレートのリンクがここへ来る（mode で分岐）。
// - verifyAndChangeEmail: 設定ページのメールアドレス変更（設定 仕様書 §4.3）の確認。開いた時点で変更を確定する
// - recoverEmail: 変更後に旧アドレスへ届く「元に戻す」リンク。誤操作を避けるため、ボタンを押してから戻す
// - resetPassword: パスワード再設定（§9.1 の「新しいパスワードを入力する画面」）
// - verifyEmail: メールアドレスの確認（現状は送っていないが、テンプレートのリンク先が同じなので受けておく）
// コード（oobCode）はプロジェクト単位なので、メールの apiKey ではなく lib/firebase.ts の設定のまま使える。

const LINK_CLASS = 'text-text-primary underline underline-offset-[3px] hover:text-text-secondary';

export default function AuthActionPage() {
  // useSearchParams を使うコンポーネントは Suspense 境界の内側に置く（Next.js の規約）
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <AuthActionContent />
    </Suspense>
  );
}

function AuthActionContent() {
  const searchParams = useSearchParams();
  const params = parseAuthActionParams(new URLSearchParams(searchParams.toString()));
  if (!params) return <InvalidLink mode={null} />;
  switch (params.mode) {
    case 'verifyAndChangeEmail':
    case 'verifyEmail':
      return <ApplyOnOpen params={params} />;
    case 'recoverEmail':
      return <RecoverEmail params={params} />;
    case 'resetPassword':
      return <ResetPassword params={params} />;
  }
}

/** Firebase のエラーコード（FirebaseError 以外は空文字） */
function codeOf(e: unknown): string {
  return e instanceof FirebaseError ? e.code : '';
}

function errorMessage(code: string): string {
  if (code === 'auth/network-request-failed') return M.network;
  if (code === 'auth/too-many-requests') return M.tooManyRequests;
  return M.generic;
}

/** このブラウザで変更前のアドレスでログイン中なら、ログアウトしておく（Firebase の仕様でどのみち切れるため、表示のずれを防ぐ） */
async function signOutIfSignedInAs(email: string | null | undefined) {
  const current = auth.currentUser?.email;
  if (!email || !current || normalizeEmail(current) !== normalizeEmail(email)) return;
  await signOut(auth).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// 共通の見た目

function StatusIcon({ tone }: { tone: 'success' | 'error' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'mx-auto flex size-12 items-center justify-center rounded-full',
        tone === 'success'
          ? 'bg-gradient-primary text-white shadow-primary'
          : 'bg-bg-card text-input-error shadow-[inset_0_0_0_1.5px_var(--color-input-error)]',
      )}
    >
      {tone === 'success' ? <CheckIcon size={24} /> : <AlertIcon size={24} />}
    </span>
  );
}

function ResultPanel({
  tone,
  title,
  children,
  action,
}: {
  tone: 'success' | 'error';
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5" data-testid="auth-action-result" data-tone={tone}>
      <StatusIcon tone={tone} />
      <SectionHeading className="text-center">{title}</SectionHeading>
      <div role={tone === 'error' ? 'alert' : 'status'} className="flex flex-col gap-3 text-md text-text-secondary">
        {children}
      </div>
      {action}
      <p className="text-center text-base text-text-muted">
        <Link href="/" className={LINK_CLASS}>
          プレミテのトップへ
        </Link>
      </p>
    </div>
  );
}

function Email({ children }: { children: ReactNode }) {
  return <span className="font-medium text-text-primary [overflow-wrap:anywhere]">{children}</span>;
}

function InvalidLink({ mode }: { mode: AuthActionMode | null }) {
  const guide = retryGuide(mode);
  return (
    <ResultPanel
      tone="error"
      title="このリンクは使えません"
      action={
        <LinkButton href={guide.href} variant="primary" size="full">
          {guide.label}
        </LinkButton>
      }
    >
      <p>リンクの有効期限が切れているか、すでに使われています。メール内のリンクは一度だけ使えます。</p>
      <p>{guide.text}</p>
    </ResultPanel>
  );
}

function FailedPanel({ message }: { message: string }) {
  return (
    <ResultPanel
      tone="error"
      title="処理できませんでした"
      action={
        <Button variant="primary" size="full" onClick={() => window.location.reload()}>
          もう一度試す
        </Button>
      }
    >
      <p>{message}</p>
    </ResultPanel>
  );
}

/** 画面を開いたときに一度だけ実行する（開発時の StrictMode の二重実行で、コードを二度使って失敗しないように） */
function useRunOnce(run: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ---------------------------------------------------------------------------
// メールアドレス変更の確認・メールアドレスの確認（開いた時点で確定）

type ApplyState =
  | { kind: 'loading' }
  | { kind: 'done'; email: string | null }
  | { kind: 'invalid' }
  | { kind: 'failed'; message: string };

function ApplyOnOpen({ params }: { params: AuthActionParams }) {
  const [state, setState] = useState<ApplyState>({ kind: 'loading' });

  useRunOnce(() => {
    (async () => {
      try {
        const info = await checkActionCode(auth, params.oobCode);
        await applyActionCode(auth, params.oobCode);
        if (params.mode === 'verifyAndChangeEmail') await signOutIfSignedInAs(info.data.previousEmail);
        setState({ kind: 'done', email: info.data.email ?? null });
      } catch (e) {
        const code = codeOf(e);
        setState(isInvalidLinkError(code) ? { kind: 'invalid' } : { kind: 'failed', message: errorMessage(code) });
      }
    })();
  });

  if (state.kind === 'loading') return <CenteredSpinner />;
  if (state.kind === 'invalid') return <InvalidLink mode={params.mode} />;
  if (state.kind === 'failed') return <FailedPanel message={state.message} />;

  if (params.mode === 'verifyEmail') {
    return (
      <ResultPanel
        tone="success"
        title="メールアドレスを確認しました"
        action={
          <LinkButton href="/" variant="primary" size="full">
            プレミテをひらく
          </LinkButton>
        }
      >
        <p>{state.email ? <><Email>{state.email}</Email> の確認が完了しました。</> : 'メールアドレスの確認が完了しました。'}</p>
      </ResultPanel>
    );
  }

  return (
    <ResultPanel
      tone="success"
      title="メールアドレスの変更が完了しました"
      action={
        <LinkButton href="/login" variant="primary" size="full">
          新しいメールアドレスでログインする
        </LinkButton>
      }
    >
      <p>
        これからは {state.email ? <Email>{state.email}</Email> : '新しいメールアドレス'} でログインしてください。
      </p>
      <p className="text-text-muted">
        ログイン中だった端末は、変更にあわせてログアウトされます。パスワードは変わっていません。
      </p>
    </ResultPanel>
  );
}

// ---------------------------------------------------------------------------
// メールアドレス変更の取り消し（旧アドレスに届くリンク）

type RecoverState =
  | { kind: 'loading' }
  | { kind: 'confirm'; restoreTo: string; changedTo: string | null }
  | { kind: 'done'; restoreTo: string }
  | { kind: 'invalid' }
  | { kind: 'failed'; message: string };

function RecoverEmail({ params }: { params: AuthActionParams }) {
  const [state, setState] = useState<RecoverState>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string>();

  useRunOnce(() => {
    (async () => {
      try {
        const info = await checkActionCode(auth, params.oobCode);
        // recoverEmail では data.email が戻す先（変更前）、previousEmail が変更後のアドレス
        setState({ kind: 'confirm', restoreTo: info.data.email ?? '', changedTo: info.data.previousEmail ?? null });
      } catch (e) {
        const code = codeOf(e);
        setState(isInvalidLinkError(code) ? { kind: 'invalid' } : { kind: 'failed', message: errorMessage(code) });
      }
    })();
  });

  async function restore(restoreTo: string, changedTo: string | null) {
    setBusy(true);
    try {
      await applyActionCode(auth, params.oobCode);
      await signOutIfSignedInAs(changedTo);
      setState({ kind: 'done', restoreTo });
    } catch (e) {
      const code = codeOf(e);
      setState(isInvalidLinkError(code) ? { kind: 'invalid' } : { kind: 'failed', message: errorMessage(code) });
    } finally {
      setBusy(false);
    }
  }

  async function sendReset(email: string) {
    setBusy(true);
    setResetError(undefined);
    try {
      auth.languageCode = 'ja';
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (e) {
      setResetError(errorMessage(codeOf(e)));
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === 'loading') return <CenteredSpinner />;
  if (state.kind === 'invalid') return <InvalidLink mode="recoverEmail" />;
  if (state.kind === 'failed') return <FailedPanel message={state.message} />;

  if (state.kind === 'confirm') {
    return (
      <div className="flex flex-col gap-5" data-testid="auth-action-recover">
        <SectionHeading className="text-center">メールアドレスを元に戻しますか？</SectionHeading>
        <div className="flex flex-col gap-3 text-md text-text-secondary">
          <p>
            プレミテのログイン用メールアドレスが
            {state.changedTo ? <> <Email>{state.changedTo}</Email> に</> : ''}変更されました。
          </p>
          <p>
            ご自身で変更した覚えがない場合は、下のボタンで <Email>{state.restoreTo}</Email> に戻してください。ご自身で変更した場合は、このまま画面を閉じてください。
          </p>
        </div>
        <Button variant="primary" size="full" loading={busy} onClick={() => restore(state.restoreTo, state.changedTo)}>
          元のメールアドレスに戻す
        </Button>
      </div>
    );
  }

  return (
    <ResultPanel
      tone="success"
      title="メールアドレスを元に戻しました"
      action={
        resetSent ? undefined : (
          <Button variant="primary" size="full" loading={busy} onClick={() => sendReset(state.restoreTo)}>
            パスワード再設定メールを送る
          </Button>
        )
      }
    >
      <p>
        ログイン用のメールアドレスを <Email>{state.restoreTo}</Email> に戻しました。
      </p>
      {resetSent ? (
        <p>
          <Email>{state.restoreTo}</Email> にパスワード再設定メールをお送りしました。メールのリンクから新しいパスワードを設定してください。
        </p>
      ) : (
        <p>ほかの人がログインした可能性があるため、念のためパスワードの再設定をおすすめします。</p>
      )}
      {resetError && (
        <p className="flex items-start gap-[6px] text-input-error">
          <AlertIcon size={14} className="mt-[2px] shrink-0" />
          <span>{resetError}</span>
        </p>
      )}
    </ResultPanel>
  );
}

// ---------------------------------------------------------------------------
// パスワード再設定（新しいパスワードの入力）

type ResetState =
  | { kind: 'loading' }
  | { kind: 'form'; email: string }
  | { kind: 'done' }
  | { kind: 'invalid' }
  | { kind: 'failed'; message: string };

function ResetPassword({ params }: { params: AuthActionParams }) {
  const [state, setState] = useState<ResetState>({ kind: 'loading' });
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [errors, setErrors] = useState<NewPasswordErrors & { form?: string }>({});
  const [busy, setBusy] = useState(false);

  useRunOnce(() => {
    (async () => {
      try {
        const email = await verifyPasswordResetCode(auth, params.oobCode);
        setState({ kind: 'form', email });
      } catch (e) {
        const code = codeOf(e);
        setState(isInvalidLinkError(code) ? { kind: 'invalid' } : { kind: 'failed', message: errorMessage(code) });
      }
    })();
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateNewPassword(password, passwordConfirm);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await confirmPasswordReset(auth, params.oobCode, password);
      setState({ kind: 'done' });
    } catch (e) {
      const code = codeOf(e);
      if (isInvalidLinkError(code)) setState({ kind: 'invalid' });
      else if (code === 'auth/weak-password') setErrors({ password: M.weakPassword });
      else setErrors({ form: errorMessage(code) });
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === 'loading') return <CenteredSpinner />;
  if (state.kind === 'invalid') return <InvalidLink mode="resetPassword" />;
  if (state.kind === 'failed') return <FailedPanel message={state.message} />;

  if (state.kind === 'done') {
    return (
      <ResultPanel
        tone="success"
        title="パスワードを再設定しました"
        action={
          <LinkButton href="/login" variant="primary" size="full">
            ログインする
          </LinkButton>
        }
      >
        <p>新しいパスワードでログインしてください。</p>
      </ResultPanel>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5" data-testid="auth-action-reset">
      <SectionHeading className="text-center">新しいパスワードを設定する</SectionHeading>
      <p className="text-md text-text-secondary">
        <Email>{state.email}</Email> のアカウントに、新しいパスワードを設定します。
      </p>
      {errors.form && (
        <p role="alert" className="flex items-start gap-[6px] text-md text-input-error">
          <AlertIcon size={14} className="mt-[2px] shrink-0" />
          <span>{errors.form}</span>
        </p>
      )}
      {/* パスワード管理ツールがどのアカウントのパスワードか分かるように、メールアドレスを隠し項目で置く */}
      <input type="email" name="username" autoComplete="username" value={state.email} readOnly tabIndex={-1} aria-hidden className="sr-only" />
      <Field label="新しいパスワード" error={errors.password} hint={`${MIN_PASSWORD_LENGTH}文字以上`}>
        {(a11y) => (
          <PasswordInput
            {...a11y}
            name="new-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        )}
      </Field>
      <Field label="新しいパスワード（確認用）" error={errors.passwordConfirm}>
        {(a11y) => (
          <PasswordInput
            {...a11y}
            name="new-password-confirm"
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            disabled={busy}
          />
        )}
      </Field>
      <Button type="submit" variant="primary" size="full" loading={busy} className="mt-1">
        パスワードを再設定する
      </Button>
    </form>
  );
}
