/**
 * 自動掲載の確認待ち（playlists.listingStatus == 'unconfirmed'）の件数。収集候補レビューUI仕様書 §8.2。
 * ページを移るたびに取り直す（usePendingWorkflowCount と同じ。リアルタイム更新はしない）。
 */
'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { countListing } from '@/lib/collection-admin';

export function usePendingListingCount(enabled: boolean): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    countListing('unconfirmed')
      .then((n) => {
        if (!cancelled) setCount(n);
      })
      .catch((e) => console.error('確認待ち件数の取得に失敗', e));
    return () => {
      cancelled = true;
    };
  }, [enabled, pathname]);

  return enabled ? count : 0;
}
