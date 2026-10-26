import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/api-auth';
import { adminDb } from '../../../../lib/firebase-admin';
import { extractPlaylistId, fetchChannelSnippet, fetchPlaylistSnippet, YouTubeApiError } from '../../../../lib/youtube';
import { hasPendingPlaylistProposal } from '../../../../lib/playlist-registration';

// 「再生リストを追加する」フォームのURL入力(blur)で叩く、書き込みなしのプレビューAPI
// （ページ 再生リストを追加する 仕様書.md 4.1節）。管理者の登録・一般ユーザーの提案（フェーズ7ステップ7-4）の
// 両方で使うため、ログインしていれば誰でも呼べる。
// 非公開の再生リストも確認エリアに出すため（§4.1.1 エラー時の表示）、公開状態はここでは弾かず isPublic で返す。
// AI説明文自動生成（4.1.4節）は今回スコープ外（wiki/sources/2026-09-10-phase2-plan.md参照）。
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
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

  const [playlistDoc, channelDoc, pendingProposal] = await Promise.all([
    adminDb.collection('playlists').doc(playlist.youtubePlaylistId).get(),
    adminDb.collection('channels').doc(channel.youtubeChannelId).get(),
    hasPendingPlaylistProposal(playlist.youtubePlaylistId),
  ]);

  return NextResponse.json({
    playlist,
    channel,
    // 再生リストのchannelIdはfetchChannelSnippetの引数に使った値そのものなので、
    // この時点では構造的に一致する（4.1.5節「チャンネル一致」）。チャンネル詳細ページから
    // 流入した場合の「流入元チャンネル一致」（5.2節）は、レスポンスの channel.youtubeChannelId を
    // クライアント側（/playlists/new）で比較し、本登録・提案の API でも再検証する。
    channelMatches: true,
    channelAlreadyRegistered: channelDoc.exists,
    playlistAlreadyRegistered: playlistDoc.exists,
    // 審査中の提案がある（§7.2）。一般ユーザーは提案不可、管理者は案内のみ（直接登録はできる）
    pendingProposal,
  });
}
