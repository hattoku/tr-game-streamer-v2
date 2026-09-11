import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/api-auth';
import { adminDb } from '../../../../lib/firebase-admin';
import {
  extractPlaylistId,
  fetchChannelSnippet,
  fetchPlaylistSnippet,
  YouTubeApiError,
} from '../../../../lib/youtube';

// 「再生リストを追加する」フォームのURL入力(blur)で叩く、書き込みなしのプレビューAPI。
// 管理者専用の最小版（ページ 再生リストを追加する 仕様書.md 4.1節）。
// 一般ユーザーの提案フロー・AI説明文自動生成（4.1.4節）は今回スコープ外
// （wiki/sources/2026-09-10-phase2-plan.md参照）。
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { playlistUrl } = await request.json();
  if (typeof playlistUrl !== 'string') {
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

  const channel = await fetchChannelSnippet(playlist.channelId);
  if (!channel) {
    return NextResponse.json({ error: 'channel_not_found' }, { status: 502 });
  }

  const [playlistDoc, channelDoc] = await Promise.all([
    adminDb.collection('playlists').doc(playlist.youtubePlaylistId).get(),
    adminDb.collection('channels').doc(channel.youtubeChannelId).get(),
  ]);

  return NextResponse.json({
    playlist,
    channel,
    // 再生リストのchannelIdはfetchChannelSnippetの引数に使った値そのものなので、
    // この時点では構造的に一致する（4.1.5節「チャンネル一致」）。将来チャンネル詳細
    // ページからの流入導線を実装する際は、流入元チャンネルIDとの比較をここに追加する。
    channelMatches: true,
    channelAlreadyRegistered: channelDoc.exists,
    playlistAlreadyRegistered: playlistDoc.exists,
  });
}
