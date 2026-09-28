/**
 * マイリスト一覧のデータ取得（`mylist`＋`watch_progress`＋`watch_history`＋`notifications`を合成）。
 * マイリストページ（`app/(main)/mylist/page.tsx`）とTOPページのマイリストセクション
 * （`components/top/MylistSection.tsx`、フェーズ6ステップ2）で共用する
 * （元は `/mylist` 内の `loadEntries` として実装していたものを切り出し）。
 * 呼び出し側のタイムアウト・リトライは `components/mylist/useMylistEntries.ts` が担う。
 * 「最後に再生した動画」判定・「最終話視聴済み」判定の詳細は `app/(main)/mylist/page.tsx` 冒頭コメント参照。
 */
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MylistCardData } from '@/components/mylist/MylistCard';
import type { WatchStatus } from '@/components/ui/Chip';

const WATCHED_THRESHOLD = 95;

export interface MylistEntry extends MylistCardData {
  updatedAt: number;
  lastPlayedAt: number;
}

export async function fetchMylistEntries(uid: string): Promise<MylistEntry[]> {
  // watch_progress / watch_history はユーザーの全件を引くと視聴するほど肥大化するため（TOPで読み込みが
  // 長引く一因だった）、マイリストの各再生リストについて必要な分だけを引く
  const [mylistSnap, newSnap] = await Promise.all([
    getDocs(query(collection(db, 'mylist'), where('userId', '==', uid))),
    getDocs(query(collection(db, 'notifications'), where('userId', '==', uid), where('isRead', '==', false))),
  ]);

  const newPlaylistIds = new Set<string>();
  newSnap.docs.forEach((d) => {
    if (d.data().type === 'series_new_episode' && d.data().playlistId) newPlaylistIds.add(d.data().playlistId);
  });

  return Promise.all(
    mylistSnap.docs.map(async (d): Promise<MylistEntry> => {
      const data = d.data();
      const playlistId: string = data.playlistId;
      const isReverseOrder: boolean = data.isReverseOrder ?? false;

      // 再生リストの最後に再生した動画（watch_progress の最新。詳細ページと同じクエリ・複合索引）
      const [playlistDoc, progressSnap] = await Promise.all([
        getDoc(doc(db, 'playlists', playlistId)),
        getDocs(
          query(
            collection(db, 'watch_progress'),
            where('userId', '==', uid),
            where('playlistId', '==', playlistId),
            orderBy('updatedAt', 'desc'),
            limit(1),
          ),
        ),
      ]);
      const progressData = progressSnap.docs[0]?.data();
      const progress = progressData
        ? {
            youtubeVideoId: progressData.youtubeVideoId as string,
            lastPlayedSeconds: (progressData.lastPlayedSeconds as number | undefined) ?? 0,
            updatedAt: (progressData.updatedAt?.toMillis?.() as number | undefined) ?? 0,
          }
        : null;

      // 最終話（逆順なら先頭）。position は 0 始まりで playlists.videoCount と同期しているため等価条件で引く
      // （orderBy + limitToLast は降順の複合索引を要求するため使わない）
      const videoCount: number = playlistDoc.exists() ? (playlistDoc.data().videoCount ?? 0) : 0;
      const lastPosition = isReverseOrder ? 0 : videoCount - 1;
      const [lastPlayedDoc, lastVideoSnap] = await Promise.all([
        progress ? getDoc(doc(db, 'videos', `${playlistId}_${progress.youtubeVideoId}`)) : Promise.resolve(null),
        videoCount > 0
          ? getDocs(query(collection(db, 'videos'), where('playlistId', '==', playlistId), where('position', '==', lastPosition), limit(1)))
          : Promise.resolve(null),
      ]);
      const lastVideoId: string | undefined = lastVideoSnap?.docs[0]?.data().youtubeVideoId;

      // 視聴率は動画単位（watch_history のIDは `${uid}_${youtubeVideoId}`）。playlistId で絞ると別の再生リストで
      // 視聴した分を取りこぼすため、必要な動画IDで引く（存在しないdocへのgetDocはルールで拒否されるためクエリにする）
      const historyIds = [...new Set([lastVideoId, progress?.youtubeVideoId].filter((id): id is string => !!id))];
      const historyPercent = new Map<string, number>();
      if (historyIds.length > 0) {
        const historySnap = await getDocs(
          query(collection(db, 'watch_history'), where('userId', '==', uid), where('youtubeVideoId', 'in', historyIds)),
        );
        historySnap.docs.forEach((h) => historyPercent.set(h.data().youtubeVideoId, h.data().progressPercent ?? 0));
      }
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
          durationSeconds: duration,
          remainingSeconds: duration != null ? Math.max(0, duration - progress.lastPlayedSeconds) : null,
          // TOPカードの話数表示用（ページ top 仕様書 §5.4）。最終話判定と同じ前提（逆順なら position 0 が最終話）で換算
          episodeNumber:
            typeof v.position === 'number' ? (isReverseOrder ? videoCount - v.position : v.position + 1) : null,
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
