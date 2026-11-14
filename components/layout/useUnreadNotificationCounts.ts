/**
 * 自分宛ての未読通知の件数を、出す場所ごとに数える（ページ ユーザー通知機能仕様書 §4.1・§4.3、v1.6）。
 * - feed: 通知一覧・ベルに出す種別（再生リスト新着など）
 * - inquiry: お問い合わせ返信（ユーザーメニューの「お問い合わせ履歴」）
 * - review: 審査結果（ユーザーメニューの「提案履歴」）
 * `notifications`（userId == 自分 && isRead == false）を onSnapshot で購読する。ベルとユーザーメニューが
 * それぞれ呼ぶが、同じクエリの購読は Firestore SDK がまとめるので読み取りは増えない。
 */
'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { isFeedNotification } from '@/lib/notification-format';

export interface UnreadNotificationCounts {
  feed: number;
  inquiry: number;
  review: number;
}

const ZERO: UnreadNotificationCounts = { feed: 0, inquiry: 0, review: 0 };

export function useUnreadNotificationCounts(): UnreadNotificationCounts {
  const { user } = useAuth();
  const [counts, setCounts] = useState<UnreadNotificationCounts>(ZERO);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid), where('isRead', '==', false));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const next = { feed: 0, inquiry: 0, review: 0 };
        snap.docs.forEach((d) => {
          const type = d.data().type;
          if (type === 'inquiry_reply') next.inquiry++;
          else if (type === 'review_result') next.review++;
          else if (isFeedNotification(type)) next.feed++;
        });
        setCounts(next);
      },
      () => setCounts(ZERO),
    );
    // ログアウト・ユーザー切替時は購読を外して件数を戻す（effect 本体では setState しない: react-hooks/set-state-in-effect）
    return () => {
      unsubscribe();
      setCounts(ZERO);
    };
  }, [user]);

  return user ? counts : ZERO;
}
