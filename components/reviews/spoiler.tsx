/**
 * ネタバレ非表示フィルター（レビュー投稿機能仕様書「ネタバレ非表示フィルター」、プロフィール仕様書 §8.2）の共通部品。
 * 再生リスト詳細のレビュー一覧とプロフィールのレビュー履歴で同じ設定を共有する。
 * 既定はON。ログイン済みは users.hideSpoilerReviews（端末をまたいで保持）、未ログインは LocalStorage に保存する。
 */
'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '@/lib/firebase';

const SPOILER_PREF_STORAGE_KEY = 'puremite:hideSpoilerReviews';

export function useHideSpoilers(user: User | null): [boolean, (next: boolean) => void] {
  const [hideSpoilers, setHideSpoilers] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = localStorage.getItem(SPOILER_PREF_STORAGE_KEY);
      return stored != null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  // ログイン済み: users を購読。未ログイン時の初期値は LocalStorage から読み、useState の遅延初期化で
  // 描画時に一度だけ求める（effectでのsetStateを避ける）
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const v = snap.data()?.hideSpoilerReviews;
      setHideSpoilers(typeof v === 'boolean' ? v : true);
    });
  }, [user]);

  async function toggle(next: boolean) {
    setHideSpoilers(next);
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { hideSpoilerReviews: next });
      } catch {
        // 失敗してもローカル表示は切り替え済みのまま（次回訪問時は既定値に戻る）
      }
    } else {
      try {
        localStorage.setItem(SPOILER_PREF_STORAGE_KEY, String(next));
      } catch {
        // 無視
      }
    }
  }

  return [hideSpoilers, toggle];
}

/** 折りたたんだネタバレコメントの代わりに出すボタン（クリックで個別展開） */
export function SpoilerRevealButton({ onReveal }: { onReveal: () => void }) {
  return (
    <button
      type="button"
      onClick={onReveal}
      className="self-start rounded-[8px] border border-border-chip bg-bg-input px-3 py-2 text-base text-text-muted hover:text-text-primary"
    >
      ネタバレを含みます。表示する
    </button>
  );
}
