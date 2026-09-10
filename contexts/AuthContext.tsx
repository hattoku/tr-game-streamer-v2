'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../lib/firebase';

// role: "user" | "operator" | "owner" | "ai_operator"（firestore.rules参照）。
// Firebase Auth Custom Claimsを正とする。未設定（サインアップ直後、init-user API呼び出し前）
// の間はnull。
type Role = 'user' | 'operator' | 'owner' | 'ai_operator' | null;

interface AuthContextValue {
  user: User | null;
  role: Role;
  loading: boolean;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: null,
  loading: true,
  refreshRole: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const tokenResult = await firebaseUser.getIdTokenResult();
        setRole((tokenResult.claims.role as Role) ?? null);
      } else {
        setRole(null);
      }
      setLoading(false);
    });
  }, []);

  // Custom Claims更新（init-user API呼び出し等）の直後は、IDトークンを強制的に
  // 再取得しないとクライアント側のroleが反映されない。
  async function refreshRole() {
    if (!auth.currentUser) return;
    const tokenResult = await auth.currentUser.getIdTokenResult(true);
    setRole((tokenResult.claims.role as Role) ?? null);
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, refreshRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
