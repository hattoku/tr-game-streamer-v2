/**
 * 管理者向けの未処理（審査中）ワークフロー件数（共通 uiコンポーネント フロント 仕様書 §2.10、管理 審査ワークフロー仕様書 §14.4）。
 * 通報・提案をまとめて数える。ページを移るたびに取り直す（承認・却下した後に別ページへ移れば減る）。リアルタイム更新はしない。
 * 管理者以外は数えない（rules 上 workflows の一覧は管理者しか読めない）。
 */
'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function usePendingWorkflowCount(enabled: boolean): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // STEP2（reviewing_lv2）は使っていないため reviewing_lv1 だけを数える（単一フィールドの等価条件）
    getCountFromServer(query(collection(db, 'workflows'), where('status', '==', 'reviewing_lv1')))
      .then((snap) => {
        if (!cancelled) setCount(snap.data().count);
      })
      .catch((e) => console.error('未処理ワークフロー件数の取得に失敗', e));
    return () => {
      cancelled = true;
    };
  }, [enabled, pathname]);

  return enabled ? count : 0;
}

/** バッジ表示用（99件を超えたら「99+」） */
export function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}
