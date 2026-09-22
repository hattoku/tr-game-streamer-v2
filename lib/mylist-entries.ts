/**
 * マイリスト一覧のデータ取得（`mylist`＋`watch_progress`＋`watch_history`＋`notifications`を合成）。
 * マイリストページ（`app/(main)/mylist/page.tsx`）とTOPページのマイリストセクション
 * （`components/top/MylistSection.tsx`、フェーズ6ステップ2）で共用する
 * （元は `/mylist` 内の `loadEntries` として実装していたものを切り出し。挙動は変更していない）。
 * 「最後に再生した動画」判定・「最終話視聴済み」判定の詳細は `app/(main)/mylist/page.tsx` 冒頭コメント参照。
 */
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MylistCardData } from '@/components/mylist/MylistCard';
import type { WatchStatus } from '@/components/ui/Chip';

const WATCHED_THRESHOLD = 95;

export interface MylistEntry extends MylistCardData {
  updatedAt: number;
  lastPlayedAt: number;
}

export async function fetchMylistEntries(uid: string): Promise<MylistEntry[]> {
  const [mylistSnap, progressSnap, historySnap, newSnap] = await Promise.all([
    getDocs(query(collection(db, 'mylist'), where('userId', '==', uid))),
    getDocs(query(collection(db, 'watch_progress'), where('userId', '==', uid))),
    getDocs(query(collection(db, 'watch_history'), where('userId', '==', uid))),
    getDocs(query(collection(db, 'notifications'), where('userId', '==', uid), where('isRead', '==', false))),
  ]);

  // 再生リストごとの最後に再生した動画（watch_progress の最新）
  const latestProgress = new Map<string, { youtubeVideoId: string; lastPlayedSeconds: number; updatedAt: number }>();
  progressSnap.docs.forEach((d) => {
    const data = d.data();
    const updatedAt = data.updatedAt?.toMillis?.() ?? 0;
    const prev = latestProgress.get(data.playlistId);
    if (!prev || updatedAt > prev.updatedAt) {
      latestProgress.set(data.playlistId, { youtubeVideoId: data.youtubeVideoId, lastPlayedSeconds: data.lastPlayedSeconds ?? 0, updatedAt });
    }
  });
  const historyPercent = new Map<string, number>();
  historySnap.docs.forEach((d) => historyPercent.set(d.data().youtubeVideoId, d.data().progressPercent ?? 0));
  const newPlaylistIds = new Set<string>();
  newSnap.docs.forEach((d) => {
    if (d.data().type === 'series_new_episode' && d.data().playlistId) newPlaylistIds.add(d.data().playlistId);
  });

  return Promise.all(
    mylistSnap.docs.map(async (d): Promise<MylistEntry> => {
      const data = d.data();
      const playlistId: string = data.playlistId;
      const isReverseOrder: boolean = data.isReverseOrder ?? false;
      const progress = latestProgress.get(playlistId);

      const [playlistDoc, lastPlayedDoc] = await Promise.all([
        getDoc(doc(db, 'playlists', playlistId)),
        progress ? getDoc(doc(db, 'videos', `${playlistId}_${progress.youtubeVideoId}`)) : Promise.resolve(null),
      ]);

      // 最終話（逆順なら先頭）。position は 0 始まりで playlists.videoCount と同期しているため等価条件で引く
      // （orderBy + limitToLast は降順の複合索引を要求するため使わない）
      const videoCount: number = playlistDoc.exists() ? (playlistDoc.data().videoCount ?? 0) : 0;
      const lastPosition = isReverseOrder ? 0 : videoCount - 1;
      const lastVideoSnap =
        videoCount > 0
          ? await getDocs(query(collection(db, 'videos'), where('playlistId', '==', playlistId), where('position', '==', lastPosition), limit(1)))
          : null;
      const lastVideoId: string | undefined = lastVideoSnap?.docs[0]?.data().youtubeVideoId;
      const finished = lastVideoId != null && (historyPercent.get(lastVideoId) ?? 0) >= WATCHED_THRESHOLD;

      let lastPlayed: MylistCardData['lastPlayed'] = null;
      if (progress && lastPlayedDoc?.exists() && !finished) {
        const v = lastPlayedDoc.data();
        const duration: number | null = v.durationSeconds ?? null;
        const percent =
          historyPercent.get(progress.youtubeVideoId) ??
          (duration ? Math.min(100, Math.round((progress.lastPlayedSeconds / duration) * 100)) : 0);
        lastPlayed = {
          title: v.title,
          thumbnailUrl: v.thumbnailUrl,
          percent,
          remainingSeconds: duration != null ? Math.max(0, duration - progress.lastPlayedSeconds) : null,
        };
      }

      return {
        mylistId: d.id,
        playlistId,
        watchStatus: (data.watchStatus as WatchStatus) ?? 'want_to_watch',
        isReverseOrder,
        updatedAt: data.updatedAt?.toMillis?.() ?? 0,
        lastPlayedAt: progress?.updatedAt ?? 0,
        playlist: playlistDoc.exists()
          ? {
              title: playlistDoc.data().title,
              thumbnailUrl: playlistDoc.data().thumbnailUrl,
              channelName: playlistDoc.data().channelName,
              channelIconUrl: playlistDoc.data().channelIconUrl,
              videoCount: playlistDoc.data().videoCount ?? 0,
            }
          : null,
        lastPlayed,
        hasNew: newPlaylistIds.has(playlistId),
      };
    }),
  );
}
