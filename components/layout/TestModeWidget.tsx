/**
 * テストモードウィジェット（共通 uiコンポーネント フロント 仕様書 §7）。
 * 画面右下に固定表示し、テストモード用会員でのログイン／ログアウトを1ボタンで切り替える。
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

export const TEST_MODE_ENABLED = process.env.NEXT_PUBLIC_TEST_MODE === 'true';

export function TestModeWidget() {
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!TEST_MODE_ENABLED) return null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (user) {
        await signOut(auth);
      } else {
        const res = await fetch('/api/test/sign-in', { method: 'POST' });
        if (!res.ok) throw new Error(`sign-in API ${res.status}`);
        const { email, password } = (await res.json()) as { email: string; password: string };
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      aria-label="テストモード"
      className="fixed right-3 z-[70] w-[180px] rounded-[8px] border border-brand-logo bg-bg-card p-3 text-md shadow-elevated bottom-[calc(var(--spacing-bottom-tabs)+env(safe-area-inset-bottom)+12px)] md:bottom-4"
    >
      <p className="mb-2 font-medium text-text-primary">🧪 テストモード</p>
      <button
        type="button"
        onClick={toggle}
        disabled={busy || loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[6px] bg-brand-logo px-3 py-2 text-base font-medium text-white transition-[filter] duration-[120ms] hover:brightness-110"
      >
        {busy && <Spinner size={14} className="text-white" />}
        {user ? 'ログアウト中に切替' : 'ログイン中に切替'}
      </button>
      <p className="mt-2 text-text-muted">現在: {loading ? '確認中' : user ? 'ログイン中' : 'ログアウト中'}</p>
      {error && (
        <p role="alert" className="mt-1 break-all text-sm text-input-error">
          {error}
        </p>
      )}
    </aside>
  );
}
