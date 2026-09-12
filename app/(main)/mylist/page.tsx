'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

// マイリストページの最小版（動作確認用、スタイリングなし。login/page.tsx・
// playlists/new/page.tsxと同じ方針）。
// document/specification/page/ページ マイリスト機能仕様書.md 準拠。ただし以下はスコープ外
// （wiki/sources/2026-09-10-phase2-plan.md参照。動画プレーヤー・新着通知は未実装のため）:
// - カード子エリア「最後に再生した動画」（watch_progressが必要、動画プレーヤー実装後に対応）
// - 新着動画の🔔NEWバッジ（新着通知バッチ実装後に対応）
// - TOPページ連携（TOPページ自体が未実装）
// - ソート「最後に再生した動画（新しい順）」は暫定的にmylist.updatedAt降順で代替
// - 「マイリストに追加」ボタンは本来は再生リスト詳細ページに設置されるが、そのページが
//   まだ存在しない（ステップ5）ため、このページ内に暫定の追加フォームを設けている

type WatchStatus = 'want_to_watch' | 'watching' | 'completed' | 'on_hold' | 'dropped';

const STATUS_LABEL: Record<WatchStatus, string> = {
  want_to_watch: '📋 見たい',
  watching: '▶️ 視聴中',
  completed: '✅ 完走',
  on_hold: '⏸️ 一時中断',
  dropped: '❌ 断念',
};

type FilterValue = 'all' | 'watching' | 'want_to_watch' | 'completed' | 'on_hold' | 'dropped';
type SortValue = 'lastUpdated' | 'titleAsc';

interface MylistEntry {
  mylistId: string;
  playlistId: string;
  watchStatus: WatchStatus;
  isReverseOrder: boolean;
  updatedAt: number;
  playlist: {
    title: string;
    thumbnailUrl: string;
    channelName: string;
    channelIconUrl: string;
  } | null;
}

interface PlaylistOption {
  id: string;
  title: string;
}

export default function MylistPage() {
  const { user, loading } = useAuth();

  const [entries, setEntries] = useState<MylistEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [sort, setSort] = useState<SortValue>('lastUpdated');

  const [playlistOptions, setPlaylistOptions] = useState<PlaylistOption[]>([]);
  const [addPlaylistId, setAddPlaylistId] = useState('');
  const [addStatus, setAddStatus] = useState<WatchStatus>('want_to_watch');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function loadEntries(uid: string) {
    setEntriesLoading(true);
    const snapshot = await getDocs(query(collection(db, 'mylist'), where('userId', '==', uid)));
    const rows = await Promise.all(
      snapshot.docs.map(async (d) => {
        const data = d.data();
        const playlistDoc = await getDoc(doc(db, 'playlists', data.playlistId));
        return {
          mylistId: d.id,
          playlistId: data.playlistId,
          watchStatus: (data.watchStatus as WatchStatus) ?? 'want_to_watch',
          isReverseOrder: data.isReverseOrder ?? false,
          updatedAt: data.updatedAt?.toMillis?.() ?? 0,
          playlist: playlistDoc.exists()
            ? {
                title: playlistDoc.data().title,
                thumbnailUrl: playlistDoc.data().thumbnailUrl,
                channelName: playlistDoc.data().channelName,
                channelIconUrl: playlistDoc.data().channelIconUrl,
              }
            : null,
        } as MylistEntry;
      }),
    );
    setEntries(rows);
    setEntriesLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    loadEntries(user.uid);
    getDocs(collection(db, 'playlists')).then((snapshot) => {
      setPlaylistOptions(snapshot.docs.map((d) => ({ id: d.id, title: d.data().title as string })));
    });
  }, [user]);

  const counts = useMemo(() => {
    const c: Record<FilterValue, number> = {
      all: entries.length,
      watching: 0,
      want_to_watch: 0,
      completed: 0,
      on_hold: 0,
      dropped: 0,
    };
    for (const e of entries) c[e.watchStatus]++;
    return c;
  }, [entries]);

  const visibleEntries = useMemo(() => {
    const filtered = filter === 'all' ? entries : entries.filter((e) => e.watchStatus === filter);
    const sorted = [...filtered];
    if (sort === 'titleAsc') {
      sorted.sort((a, b) => (a.playlist?.title ?? '').localeCompare(b.playlist?.title ?? '', 'ja'));
    } else {
      sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return sorted;
  }, [entries, filter, sort]);

  const alreadyAddedIds = useMemo(() => new Set(entries.map((e) => e.playlistId)), [entries]);
  const addablePlaylists = playlistOptions.filter((p) => !alreadyAddedIds.has(p.id));

  async function handleAdd() {
    if (!user || !addPlaylistId) return;
    setAddBusy(true);
    setAddError(null);
    try {
      const mylistId = `${user.uid}_${addPlaylistId}`;
      await setDoc(doc(db, 'mylist', mylistId), {
        userId: user.uid,
        playlistId: addPlaylistId,
        watchStatus: addStatus,
        isReverseOrder: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setAddPlaylistId('');
      setAddStatus('want_to_watch');
      await loadEntries(user.uid);
    } catch {
      setAddError('マイリストへの追加に失敗しました');
    } finally {
      setAddBusy(false);
    }
  }

  async function handleStatusChange(entry: MylistEntry, status: WatchStatus) {
    await updateDoc(doc(db, 'mylist', entry.mylistId), { watchStatus: status, updatedAt: serverTimestamp() });
    if (user) await loadEntries(user.uid);
  }

  async function handleReverseToggle(entry: MylistEntry, value: boolean) {
    await updateDoc(doc(db, 'mylist', entry.mylistId), { isReverseOrder: value, updatedAt: serverTimestamp() });
    if (user) await loadEntries(user.uid);
  }

  async function handleRemove(entry: MylistEntry) {
    await deleteDoc(doc(db, 'mylist', entry.mylistId));
    if (user) await loadEntries(user.uid);
  }

  if (loading) return <p>読み込み中...</p>;
  if (!user) return <p>ログインしてください。</p>;

  return (
    <div>
      <h1>マイリスト</h1>

      <div style={{ border: '1px solid #ccc', padding: 8, marginBottom: 16 }}>
        <p>マイリストに追加（暫定: 本来は再生リスト詳細ページのボタンから行う想定）</p>
        <select value={addPlaylistId} onChange={(e) => setAddPlaylistId(e.target.value)}>
          <option value="">再生リストを選択...</option>
          {addablePlaylists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <select value={addStatus} onChange={(e) => setAddStatus(e.target.value as WatchStatus)}>
          {(Object.keys(STATUS_LABEL) as WatchStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button onClick={handleAdd} disabled={!addPlaylistId || addBusy}>
          追加する
        </button>
        {addError && <p style={{ color: 'red' }}>{addError}</p>}
      </div>

      <div>
        <button onClick={() => setFilter('all')}>すべて {counts.all}</button>
        <button onClick={() => setFilter('watching')}>視聴中 {counts.watching}</button>
        <button onClick={() => setFilter('want_to_watch')}>見たい {counts.want_to_watch}</button>
        <button onClick={() => setFilter('completed')}>完走 {counts.completed}</button>
        <select
          value={filter === 'on_hold' || filter === 'dropped' ? filter : ''}
          onChange={(e) => setFilter(e.target.value as FilterValue)}
        >
          <option value="">その他 ▼</option>
          <option value="on_hold">一時中断 {counts.on_hold}</option>
          <option value="dropped">断念 {counts.dropped}</option>
        </select>
      </div>

      <div>
        ソート:{' '}
        <select value={sort} onChange={(e) => setSort(e.target.value as SortValue)}>
          <option value="lastUpdated">最終更新（新しい順）</option>
          <option value="titleAsc">再生リスト名（昇順）</option>
        </select>
      </div>

      {entriesLoading ? (
        <p>読み込み中...</p>
      ) : visibleEntries.length === 0 ? (
        <div>
          <p>⭐ マイリストは空です</p>
          <p>気になる動画をマイリストに追加して、自分だけのリストを作りましょう</p>
        </div>
      ) : (
        visibleEntries.map((entry) => (
          <div key={entry.mylistId} style={{ border: '1px solid #ccc', padding: 8, marginBottom: 8 }}>
            {entry.playlist ? (
              <>
                <img src={entry.playlist.thumbnailUrl} alt="" width={160} />
                <p>{entry.playlist.title}</p>
                <p>
                  <img src={entry.playlist.channelIconUrl} alt="" width={24} style={{ borderRadius: '50%' }} />{' '}
                  {entry.playlist.channelName}
                </p>
              </>
            ) : (
              <p>（再生リスト情報が見つかりません: {entry.playlistId}）</p>
            )}
            <select
              value={entry.watchStatus}
              onChange={(e) => handleStatusChange(entry, e.target.value as WatchStatus)}
            >
              {(Object.keys(STATUS_LABEL) as WatchStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <label>
              <input
                type="checkbox"
                checked={entry.isReverseOrder}
                onChange={(e) => handleReverseToggle(entry, e.target.checked)}
              />
              逆順で再生
            </label>
            <button onClick={() => handleRemove(entry)}>マイリストから削除</button>
          </div>
        ))
      )}
    </div>
  );
}
