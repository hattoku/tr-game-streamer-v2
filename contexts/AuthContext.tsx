'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

// role: "user" | "operator" | "owner" | "ai_operator"（firestore.rules参照）。
// Firebase Auth Custom Claimsを正とする。未設定（サインアップ直後、init-user API呼び出し前）
// の間はnull。
type Role = 'user' | 'operator' | 'owner' | 'ai_operator' | null;

interface AuthContextValue {
  user: User | null;
  role: Role;
  /** users/{uid}.displayName（ヘッダー表示用。未取得・未ログイン時は null） */
  displayName: string | null;
  loading: boolean;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: null,
  displayName: null,
  loading: true,
  refreshRole: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const tokenResult = await firebaseUser.getIdTokenResult();
        setRole((tokenResult.claims.role as Role) ?? null);
      } else {
        setRole(null);
        setDisplayName(null);
      }
      setLoading(false);
    });
  }, []);

  // ヘッダーのユーザーメニュー用の表示名を購読する（/settings での変更を即座に反映するため
  // 一度きりの取得ではなく onSnapshot を使う。失敗しても認証状態には影響させない）。
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => setDisplayName((snap.data()?.displayName as string | undefined) ?? null),
      () => setDisplayName(null),
    );
    return () => {
      unsubscribe();
      setDisplayName(null);
    };
  }, [user]);

  // Custom Claims更新（init-user API呼び出し等）の直後は、IDトークンを強制的に
  // 再取得しないとクライアント側のroleが反映されない。
  async function refreshRole() {
    if (!auth.currentUser) return;
    const tokenResult = await auth.currentUser.getIdTokenResult(true);
    setRole((tokenResult.claims.role as Role) ?? null);
  }

  return (
    <AuthContext.Provider value={{ user, role, displayName, loading, refreshRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
