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

/** チャンネルカードのピックアップ再生リスト1件分（ページ チャンネル 探す 仕様書 §3.3） */
export interface ChannelPickupPlaylist {
  id: string;
  title: string;
  thumbnailUrl: string;
  score: number | null;
}

export interface ChannelAggregate {
  /** このチャンネルに紐づく公開再生リストの動画数合計 */
  videoCount: number;
  /** スコアが高い順の上位3件（評価なしは末尾） */
  topPlaylists: ChannelPickupPlaylist[];
}

const PICKUP_COUNT = 3;

/**
 * チャンネルごとの総動画数とピックアップ再生リスト（スコア上位3件）を集計する
 * （ページ チャンネル 探す 仕様書 §3.3）。`channels.playlistCount`は登録APIで維持済みだが、
 * 総動画数・ピックアップは`channels`スキーマに無いため、`fetchGameVideoCounts`と同じく
 * 公開`playlists`から都度クライアント集計する。
 */
export async function fetchChannelAggregates(): Promise<Map<string, ChannelAggregate>> {
  const snap = await getDocs(query(collection(db, 'playlists'), where('isPublic', '==', true)));
  const map = new Map<string, ChannelAggregate>();
  snap.docs.forEach((d) => {
    const data = d.data();
    const channelId = data.channelId as string | null | undefined;
    if (!channelId) return;
    const entry = map.get(channelId) ?? { videoCount: 0, topPlaylists: [] };
    entry.videoCount += (data.videoCount as number) ?? 0;
    entry.topPlaylists.push({
      id: d.id,
      title: (data.title as string) ?? '',
      thumbnailUrl: (data.thumbnailUrl as string) ?? '',
      score: (data.score as number | null) ?? null,
    });
    map.set(channelId, entry);
  });
  for (const entry of map.values()) {
    // スコアが高い順、評価なし（null）は末尾（PlaylistGrid.sortPlaylists と同じ規則）
    entry.topPlaylists.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    entry.topPlaylists = entry.topPlaylists.slice(0, PICKUP_COUNT);
  }
  return map;
}
