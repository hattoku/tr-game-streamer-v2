'use client';

import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';

// 認証まわりの実装土台（動作確認用の最小限のページ）。
// フル仕様（ソーシャルログイン・パスワード再発行・初期設定ウィザード等）は
// document/specification/page/ページ ログイン アカウント登録・ログイン仕様書.md 参照。
// マイリスト機能・実ゲームタイトルデータが揃うフェーズ2以降で本実装する。
export default function LoginPage() {
  const { user, role, loading, refreshRole } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function handleSignOut() {
    await signOut(auth);
  }

  if (loading) return <p>読み込み中...</p>;

  if (user) {
    return (
      <div>
        <p>ログイン中: {user.email}</p>
        <p>role: {role ?? '(未設定)'}</p>
        <button onClick={handleSignOut}>ログアウト</button>
      </div>
    );
  }

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
