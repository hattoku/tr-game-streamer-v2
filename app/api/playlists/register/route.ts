import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/api-auth';
import { adminDb } from '../../../../lib/firebase-admin';
import {
  extractPlaylistId,
  fetchChannelSnippet,
  fetchPlaylistItems,
  fetchPlaylistSnippet,
  fetchVideoDurations,
  YouTubeApiError,
} from '../../../../lib/youtube';

// 再生リストの本登録API（管理者専用）。プレビュー時の情報をそのまま信用せず、
// YouTube APIとFirestoreの状態をサーバー側で取り直してから書き込む。
// AI説明文自動生成（仕様書4.1.4節）はスコープ外のため、新規チャンネルの説明文は
// 管理者の手入力（channelDescription、任意）をそのまま保存する。
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { playlistUrl, gameId, channelDescription } = await request.json();
  if (typeof playlistUrl !== 'string' || typeof gameId !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
  }

  let playlist;
  try {
    playlist = await fetchPlaylistSnippet(playlistId);
  } catch (e) {
    const message = e instanceof YouTubeApiError ? e.message : 'youtube_api_error';
    return NextResponse.json({ error: 'youtube_api_error', message }, { status: 502 });
  }
  if (!playlist) {
    return NextResponse.json({ error: 'playlist_not_found' }, { status: 404 });
  }
  if (!playlist.isPublic) {
    return NextResponse.json({ error: 'not_public' }, { status: 422 });
  }

  const channel = await fetchChannelSnippet(playlist.channelId);
  if (!channel) {
    return NextResponse.json({ error: 'channel_not_found' }, { status: 502 });
  }

  const playlistRef = adminDb.collection('playlists').doc(playlist.youtubePlaylistId);
  const channelRef = adminDb.collection('channels').doc(channel.youtubeChannelId);
  const gameRef = adminDb.collection('games').doc(gameId);

  const [playlistDoc, channelDoc, gameDoc] = await Promise.all([
    playlistRef.get(),
    channelRef.get(),
    gameRef.get(),
  ]);

  if (playlistDoc.exists) {
    return NextResponse.json({ error: 'already_registered' }, { status: 409 });
  }
  if (!gameDoc.exists) {
    return NextResponse.json({ error: 'game_not_found' }, { status: 404 });
  }
  const game = gameDoc.data()!;

  const items = await fetchPlaylistItems(playlistId);
  const durations = await fetchVideoDurations(items.map((i) => i.youtubeVideoId));

  const now = new Date();
  const batch = adminDb.batch();

  if (channelDoc.exists) {
    batch.update(channelRef, { playlistCount: (channelDoc.data()!.playlistCount ?? 0) + 1 });
  } else {
    batch.set(channelRef, {
      youtubeChannelId: channel.youtubeChannelId,
      name: channel.name,
      iconUrl: channel.iconUrl,
      description: typeof channelDescription === 'string' && channelDescription.trim() ? channelDescription.trim() : null,
      isAiGeneratedDescription: false,
      subscriberCount: null,
      playlistCount: 1,
      registeredAt: now,
      lastFetchedAt: null,
    });
  }

  batch.set(playlistRef, {
    youtubePlaylistId: playlist.youtubePlaylistId,
    title: playlist.title,
    thumbnailUrl: playlist.thumbnailUrl,
    channelId: channel.youtubeChannelId,
    channelName: channel.name,
    channelIconUrl: channel.iconUrl,
    gameId,
    gameName: game.title,
    gameGenreIds: game.genreId ? [game.genreId] : [],
    videoCount: items.length,
    latestVideoPublishedAt: items.length > 0
      ? items.reduce((latest, i) => (i.publishedAt > latest ? i.publishedAt : latest), items[0].publishedAt)
      : null,
    registeredAt: now,
    registeredBy: auth.uid,
    isPublic: true,
    score: null,
    reviewCount: 0,
    mylistCount: 0,
    playlistTagIds: [],
    playlistTagsFixed: [],
    referenceUrl: playlistUrl,
    lastFetchedAt: null,
  });

  for (const item of items) {
    const videoRef = adminDb.collection('videos').doc(`${playlist.youtubePlaylistId}_${item.youtubeVideoId}`);
    batch.set(videoRef, {
      youtubeVideoId: item.youtubeVideoId,
      playlistId: playlist.youtubePlaylistId,
      position: item.position,
      title: item.title,
      thumbnailUrl: item.thumbnailUrl,
      durationSeconds: durations.get(item.youtubeVideoId) ?? null,
      publishedAt: new Date(item.publishedAt),
      playStartCount: 0,
    });
  }

  batch.update(gameRef, { playlistCount: (game.playlistCount ?? 0) + 1 });

  await batch.commit();

  return NextResponse.json({
    playlistId: playlist.youtubePlaylistId,
    title: playlist.title,
    thumbnailUrl: playlist.thumbnailUrl,
    channelName: channel.name,
    channelIconUrl: channel.iconUrl,
    gameName: game.title,
    videoCount: items.length,
  });
}
