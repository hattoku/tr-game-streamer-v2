/**
 * テストモードウィジェット（共通 uiコンポーネント フロント 仕様書 §7）。
 * 画面右下に固定表示し、「一般ユーザー」「管理者」のテスト用会員でのログインと、ログアウトを切り替える。
 * `NEXT_PUBLIC_TEST_MODE=true` のビルドでのみ描画する（本番では表示しない）。
 * ログインは /api/test/sign-in が毎回設定し直す使い捨てパスワードで行う（資格情報を環境変数やコードに持たない）。
 * モバイルではボトムタブバーに重ならないよう、その上に置く。
 */
'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/components/ui/cn';

export const TEST_MODE_ENABLED = process.env.NEXT_PUBLIC_TEST_MODE === 'true';

type Kind = 'user' | 'admin';

const KIND_LABEL: Record<Kind, string> = { user: '一般ユーザー', admin: '管理者' };

export function TestModeWidget() {
  const { user, role, loading, refreshRole } = useAuth();
  const [busy, setBusy] = useState<Kind | 'signout' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!TEST_MODE_ENABLED) return null;

  const currentKind: Kind | null = !user ? null : role === 'owner' || role === 'operator' ? 'admin' : 'user';

  async function signInAs(kind: Kind) {
    setBusy(kind);
    setError(null);
    try {
      if (user) await signOut(auth);
      const res = await fetch('/api/test/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) throw new Error(`sign-in API ${res.status}`);
      const { email, password } = (await res.json()) as { email: string; password: string };
      await signInWithEmailAndPassword(auth, email, password);
      // role の Custom Claims を更新した直後はトークンを強制再取得しないと反映されない
      await refreshRole();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleSignOut() {
    setBusy('signout');
    setError(null);
    try {
      await signOut(auth);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null || loading;

  return (
    <aside
      aria-label="テストモード"
      className="fixed right-3 z-[70] w-[200px] rounded-[10px] border border-brand-primary bg-gradient-elevated p-3 text-md shadow-elevated bottom-[calc(var(--spacing-bottom-tabs)+env(safe-area-inset-bottom)+12px)] md:bottom-4"
    >
      <p className="mb-2 font-medium text-text-primary">🧪 テストモード</p>
      <p className="mb-2 text-text-muted">
        現在: {loading ? '確認中' : currentKind ? `${KIND_LABEL[currentKind]}でログイン中` : 'ログアウト中'}
      </p>
      <div className="flex flex-col gap-[6px]">
        {(['user', 'admin'] as Kind[]).map((kind) => {
          const isCurrent = currentKind === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => signInAs(kind)}
              disabled={disabled || isCurrent}
              aria-pressed={isCurrent}
              className={cn(
                'inline-flex w-full items-center justify-center gap-2 rounded-[6px] px-3 py-[6px] text-base font-medium transition-[filter] duration-[120ms]',
                isCurrent ? 'bg-bg-btn text-text-tertiary' : 'bg-gradient-primary text-white hover:brightness-110',
              )}
            >
              {busy === kind && <Spinner size={14} className="text-white" />}
              {KIND_LABEL[kind]}でログイン
            </button>
          );
        })}
        {user && (
          <button
            type="button"
            onClick={handleSignOut}
            disabled={disabled}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[6px] border border-border-control bg-gradient-secondary px-3 py-[6px] text-base font-medium text-text-btn hover:bg-gradient-secondary-hover"
          >
            {busy === 'signout' && <Spinner size={14} />}
            ログアウト
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 break-all text-sm text-input-error">
          {error}
        </p>
      )}
    </aside>
  );
}
