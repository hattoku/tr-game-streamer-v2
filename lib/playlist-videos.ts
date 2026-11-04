// 再生リストの動画一覧を YouTube から全件取り、videos に保存する（サーバー専用）。
// 掲載するとき（動画一覧をまだ取っていない再生リスト）と、30日ごとの全件の取り直し（YouTube API 規約 III.E.4）で使う。
// 管理_Ai運営者 コンテンツ収集機能仕様書 §10.11、共通 YouTube定期取得仕様書 §8.4・§8.6。
// 既にある動画はタイトル・サムネイル・順番・再生時間・公開日時だけを上書きし、再生開始回数（playStartCount）は残す。
// YouTube から消えた動画のドキュメントは、視聴記録が付いていることがあるので消さない。
import { adminDb } from './firebase-admin';
import { fetchPlaylistItems, fetchVideoDurations, type PlaylistItemSnippet } from './youtube';

const WRITE_CHUNK_SIZE = 400;

export interface StoredVideos {
  items: PlaylistItemSnippet[];
  /** 今回はじめて保存した動画の数 */
  newCount: number;
  /** 一番新しい動画の公開日時（動画が無ければ null） */
  latestPublishedAt: Date | null;
}

/** 動画一覧を取る見込みのユニット数（playlistItems.list と videos.list が動画50本ごとに各1、余分の1ページ） */
export function estimateVideoFetchCost(videoCount: number): number {
  return Math.ceil(Math.max(videoCount, 1) / 50) * 2 + 1;
}

export async function fetchAndStoreAllVideos(playlistId: string): Promise<StoredVideos> {
  const items = await fetchPlaylistItems(playlistId);
  const durations = await fetchVideoDurations(items.map((i) => i.youtubeVideoId));
  const existingSnap = await adminDb.collection('videos').where('playlistId', '==', playlistId).select().get();
  const existing = new Set(existingSnap.docs.map((d) => d.id));

  let newCount = 0;
  for (let start = 0; start < items.length; start += WRITE_CHUNK_SIZE) {
    const batch = adminDb.batch();
    for (const item of items.slice(start, start + WRITE_CHUNK_SIZE)) {
      const ref = adminDb.collection('videos').doc(`${playlistId}_${item.youtubeVideoId}`);
      const fields = {
        youtubeVideoId: item.youtubeVideoId,
        playlistId,
        position: item.position,
        title: item.title,
        thumbnailUrl: item.thumbnailUrl,
        durationSeconds: durations.get(item.youtubeVideoId) ?? null,
        publishedAt: new Date(item.publishedAt),
      };
      if (existing.has(ref.id)) {
        batch.update(ref, fields);
      } else {
        batch.set(ref, { ...fields, playStartCount: 0 });
        newCount++;
      }
    }
    await batch.commit();
  }

  const latest = items.length > 0 ? items.reduce((l, i) => (i.publishedAt > l ? i.publishedAt : l), items[0].publishedAt) : null;
  return { items, newCount, latestPublishedAt: latest ? new Date(latest) : null };
}
