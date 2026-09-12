'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, doc, getDocs, query, where, orderBy, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

// 通知一覧ページの最小版（動作確認用、スタイリングなし。他のページと同じ方針）。
// document/specification/page/ページ ユーザー通知機能仕様書.md 準拠。
// フェーズ2では「シリーズ新着通知」のみ実装（お知らせ・審査結果・お問い合わせ返信は
// 依拠する機能が未実装のためスコープ外）。FCMプッシュ通知・ヘッダーベルアイコン
// （共有ヘッダー自体が未実装）・ページネーション（90日保持バッチ含む）も見送り。
// 「新着動画を再取得」ボタンは本来の管理画面が存在しないため、暫定的にこのページの
// 管理者向けエリアに置いている（app/api/admin/refresh-new-videos/route.ts参照）。

interface NotificationItem {
  id: string;
  message: string;
  isRead: boolean;
  playlistId: string | null;
  createdAt: string;
}

type Filter = 'all' | 'unread';

export default function NotificationsPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  const isAdmin = role === 'owner' || role === 'operator';

  async function loadNotifications(uid: string) {
    setNotifLoading(true);
    const snapshot = await getDocs(
      query(collection(db, 'notifications'), where('userId', '==', uid), orderBy('createdAt', 'desc')),
    );
    setNotifications(
      snapshot.docs.map((d) => ({
        id: d.id,
        message: d.data().message,
        isRead: d.data().isRead,
        playlistId: d.data().playlistId ?? null,
        createdAt: d.data().createdAt?.toDate?.().toLocaleString('ja-JP') ?? '',
      })),
    );
    setNotifLoading(false);
  }

  useEffect(() => {
    if (user) loadNotifications(user.uid);
  }, [user]);

  const visible = filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function handleClick(n: NotificationItem) {
    if (!n.isRead) {
      await updateDoc(doc(db, 'notifications', n.id), { isRead: true });
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    }
    if (n.playlistId) router.push(`/playlists/${n.playlistId}`);
  }

  async function handleMarkAllRead() {
    const batch = writeBatch(db);
    notifications.filter((n) => !n.isRead).forEach((n) => batch.update(doc(db, 'notifications', n.id), { isRead: true }));
    await batch.commit();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  async function handleRefresh() {
    setRefreshBusy(true);
    setRefreshResult(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/refresh-new-videos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = await res.json();
      if (!res.ok) {
        setRefreshResult('再取得に失敗しました');
        return;
      }
      setRefreshResult(
        `確認済み${body.playlistsChecked}件中${body.playlistsWithNewVideos}件に新着（動画${body.totalNewVideos}本、通知${body.notificationsCreated}件生成）`,
      );
      if (user) await loadNotifications(user.uid);
    } catch {
      setRefreshResult('再取得に失敗しました');
    } finally {
      setRefreshBusy(false);
    }
  }

  if (loading) return <p>読み込み中...</p>;
  if (!user) return <p>ログインしてください。</p>;

  return (
    <div>
      <h1>通知</h1>

      {isAdmin && (
        <div style={{ border: '1px solid #ccc', padding: 8, marginBottom: 16 }}>
          <p>管理者向け（暫定）: 新着動画の手動再取得</p>
          <button onClick={handleRefresh} disabled={refreshBusy}>
            新着動画を再取得
          </button>
          {refreshResult && <p>{refreshResult}</p>}
        </div>
      )}

      <button onClick={handleMarkAllRead} disabled={unreadCount === 0}>
        すべて既読にする
      </button>

      <div>
        <button onClick={() => setFilter('all')}>すべて {notifications.length}</button>
        <button onClick={() => setFilter('unread')}>未読 {unreadCount}</button>
      </div>

      {notifLoading ? (
        <p>読み込み中...</p>
      ) : notifications.length === 0 ? (
        <p>通知はまだありません</p>
      ) : visible.length === 0 ? (
        <p>該当する通知はありません</p>
      ) : (
        visible.map((n) => (
          <div
            key={n.id}
            style={{ border: '1px solid #ccc', padding: 8, marginBottom: 4, cursor: 'pointer' }}
            onClick={() => handleClick(n)}
          >
            {!n.isRead && '🔴 '}
            <span>シリーズ新着</span>
            <p>{n.message}</p>
            <p>{n.createdAt}</p>
          </div>
        ))
      )}
    </div>
  );
}
