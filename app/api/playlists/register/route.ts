import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/api-auth';
import { registerPlaylist, type RegisterPlaylistError } from '../../../../lib/playlist-registration';
import { extractPlaylistId } from '../../../../lib/youtube';

// 再生リストの本登録API（管理者専用）。登録処理の本体はコンテンツ収集の承認と共用の
// lib/playlist-registration.ts にある（YouTube APIとFirestoreの状態をサーバー側で取り直してから書き込む）。
// チャンネル詳細ページから流入した場合は `sourceChannelId`（任意）を受け取り、再生リストのチャンネルと
// 一致しなければ登録を拒否する（仕様書5.2節「流入元チャンネル一致」。クライアント側の判定を信用しない二重チェック）。
const ERROR_STATUS: Record<RegisterPlaylistError, number> = {
  youtube_api_error: 502,
  playlist_not_found: 404,
  not_public: 422,
  channel_not_found: 502,
  already_registered: 409,
  game_not_found: 404,
  channel_mismatch: 422,
};

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { playlistUrl, gameId, channelDescription, sourceChannelId } = await request.json();
  if (typeof playlistUrl !== 'string' || typeof gameId !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
  }

  const result = await registerPlaylist({
    playlistId,
    gameId,
    registeredBy: auth.uid,
    referenceUrl: playlistUrl,
    channelDescription: typeof channelDescription === 'string' ? channelDescription : null,
    sourceChannelId: typeof sourceChannelId === 'string' ? sourceChannelId : null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.error === 'youtube_api_error' ? { message: result.message ?? 'youtube_api_error' } : {}) },
      { status: ERROR_STATUS[result.error] },
    );
  }
  return NextResponse.json(result.playlist);
}
