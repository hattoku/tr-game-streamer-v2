'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

// 認証まわりの実装土台（動作確認用の最小限のページ）。
// フル仕様（ソーシャルログイン・パスワード再発行・初期設定ウィザード等）は
// document/specification/page/ページ ログイン アカウント登録・ログイン仕様書.md 参照。
// マイリスト機能・実ゲームタイトルデータが揃うフェーズ2以降で本実装する。
// ログアウトはヘッダーのユーザードロップダウン（components/layout/UserDropdown.tsx）へ移した。
// ログイン済みでこのページに来た場合は TOP へ戻す（ログイン仕様書 §5.4 の遷移先は暫定で TOP）。
// フォームのデザイン適用はフェーズ2.5ステップ6で行う。
export default function LoginPage() {
  const { user, loading, refreshRole } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  async function handleSignUp() {
    setError(null);
    setBusy(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();
      const res = await fetch('/api/auth/init-user', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error('ユーザー初期化に失敗しました');
      await refreshRole();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignIn() {
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading || user) return <p>読み込み中...</p>;

  return (
    <div>
      <p>ログアウト中</p>
      <div>
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="パスワード（8文字以上）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button onClick={handleSignIn} disabled={busy}>
        ログイン
      </button>
      <button onClick={handleSignUp} disabled={busy}>
        新規登録
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
