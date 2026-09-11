import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/api-auth';
import { adminDb } from '../../../../lib/firebase-admin';
import { fetchPlaylistItems, fetchVideoDurations, YouTubeApiError } from '../../../../lib/youtube';

// 新着動画の手動再取得API（管理者専用）。
// 本来は動画更新バッチ（RSS優先・API フォールバック、Cloud Functions + Cloud Scheduler）
// が担う処理だが、今回はCloud Functions基盤を導入せず、この管理画面ボタン相当のAPI Route
// で代替する（ユーザー確認済み、wiki/sources/2026-09-10-phase2-plan.md参照）。
// RSSフィードによるクォータ節約も今回は行わず、都度YouTube Data APIを直接呼び出す
// （手動・低頻度トリガーのためクォータ最適化の優先度は低いと判断）。
//
// 登録済みの全公開再生リストを対象に新着動画を検出し、videos/playlistsを更新した上で、
// 新着があった再生リストをマイリスト登録しているユーザー全員にnotificationsを生成する
// （ユーザー通知機能仕様書の「シリーズ新着通知」のみ実装。他3種別はスコープ外）。
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const playlistsSnap = await adminDb.collection('playlists').where('isPublic', '==', true).get();

  let playlistsChecked = 0;
  let playlistsWithNewVideos = 0;
  let totalNewVideos = 0;
  let notificationsCreated = 0;
  const errors: Array<{ playlistId: string; message: string }> = [];

  for (const playlistDoc of playlistsSnap.docs) {
    playlistsChecked++;
    const playlistId = playlistDoc.id;
    const playlist = playlistDoc.data();

    let items;
    try {
      items = await fetchPlaylistItems(playlistId);
    } catch (e) {
      errors.push({ playlistId, message: e instanceof YouTubeApiError ? e.message : 'youtube_api_error' });
      continue;
    }

    const existingSnap = await adminDb.collection('videos').where('playlistId', '==', playlistId).get();
    const existingIds = new Set(existingSnap.docs.map((d) => d.data().youtubeVideoId));
    const newItems = items.filter((i) => !existingIds.has(i.youtubeVideoId));

    if (newItems.length === 0) continue;

    playlistsWithNewVideos++;
    totalNewVideos += newItems.length;

    const durations = await fetchVideoDurations(newItems.map((i) => i.youtubeVideoId));

    const batch = adminDb.batch();
    for (const item of newItems) {
      const videoRef = adminDb.collection('videos').doc(`${playlistId}_${item.youtubeVideoId}`);
      batch.set(videoRef, {
        youtubeVideoId: item.youtubeVideoId,
        playlistId,
        position: item.position,
        title: item.title,
        thumbnailUrl: item.thumbnailUrl,
        durationSeconds: durations.get(item.youtubeVideoId) ?? null,
        publishedAt: new Date(item.publishedAt),
        playStartCount: 0,
      });
    }

    const latestPublishedAt = newItems.reduce(
      (latest, i) => (i.publishedAt > latest ? i.publishedAt : latest),
      newItems[0].publishedAt,
    );
    batch.update(playlistDoc.ref, {
      videoCount: items.length,
      latestVideoPublishedAt: new Date(latestPublishedAt),
      lastFetchedAt: new Date(),
    });

    const mylistSnap = await adminDb.collection('mylist').where('playlistId', '==', playlistId).get();
    for (const mylistDoc of mylistSnap.docs) {
      const notificationRef = adminDb.collection('notifications').doc();
      batch.set(notificationRef, {
        userId: mylistDoc.data().userId,
        type: 'series_new_episode',
        playlistId,
        playlistTitle: playlist.title,
        message: `「${playlist.title}」に新しい動画が追加されました`,
        isRead: false,
        createdAt: new Date(),
      });
      notificationsCreated++;
    }

    await batch.commit();
  }

  return NextResponse.json({
    playlistsChecked,
    playlistsWithNewVideos,
    totalNewVideos,
    notificationsCreated,
    errors,
  });
}
