import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

/**
 * ゲームタイトルごとの総動画数（公開再生リストの`videoCount`合計）を集計する。
 * `games.playlistCount`は登録API（`app/api/playlists/register/route.ts`）で維持済みだが、
 * 総動画数は`games`スキーマに集計フィールドが無いため、都度`playlists`から集計する
 * （カタログ規模が小さい前提のクライアント集計。`isPublic`の単一条件クエリのみのため
 * 新規のFirestore複合indexは不要）。
 * ページ ゲームタイトル 探す仕様書 §3.3・ページ ゲームタイトル 詳細仕様書 §3.3参照。
 */
export async function fetchGameVideoCounts(): Promise<Map<string, number>> {
  const snap = await getDocs(query(collection(db, 'playlists'), where('isPublic', '==', true)));
  const map = new Map<string, number>();
  snap.docs.forEach((d) => {
    const gameId = d.data().gameId as string | null | undefined;
    if (!gameId) return;
    map.set(gameId, (map.get(gameId) ?? 0) + (d.data().videoCount ?? 0));
  });
  return map;
}
