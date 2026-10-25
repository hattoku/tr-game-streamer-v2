import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/api-auth';
import { adminDb } from '../../../../lib/firebase-admin';
import { fetchValidPlaylist, hasPendingPlaylistProposal, newWorkflowRecord } from '../../../../lib/playlist-registration';
import { PLAYLIST_PROPOSAL_TYPE } from '../../../../lib/proposal-shared';

// 一般ユーザーの再生リスト登録提案API（ページ 再生リストを追加する 仕様書 §5.4、フェーズ7ステップ7-4）。
// 本番の `playlists` には書かず、`workflows`（type: "playlist_register"、ステータス「審査中」）に保存する。
// 承認・却下は管理画面（/admin/workflows、単一ステップ。管理 審査ワークフロー仕様書 §14）で行い、
// 承認時に /api/playlists/register と同じ登録処理（lib/playlist-registration.ts）が走る。
// 制約チェック（§4.1.5・§5.2）は登録と同じ順序でサーバー側でも行う（クライアントの判定を信用しない）。
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { playlistUrl, gameId, sourceChannelId } = await request.json();
  if (typeof playlistUrl !== 'string' || typeof gameId !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const valid = await fetchValidPlaylist(playlistUrl);
  if ('error' in valid) {
    return NextResponse.json({ error: valid.error, message: valid.message }, { status: valid.status });
  }
  const { playlist, channel } = valid;

  const [playlistDoc, gameDoc] = await Promise.all([
    adminDb.collection('playlists').doc(playlist.youtubePlaylistId).get(),
    adminDb.collection('games').doc(gameId).get(),
  ]);
  // §7.2 一般ユーザー固有エラー: 審査中の提案がある・登録済みは同じ文言で返す
  if (playlistDoc.exists) {
    return NextResponse.json({ error: 'already_proposed' }, { status: 409 });
  }
  if (!gameDoc.exists) {
    return NextResponse.json({ error: 'game_not_found' }, { status: 404 });
  }
  if (typeof sourceChannelId === 'string' && sourceChannelId && sourceChannelId !== channel.youtubeChannelId) {
    return NextResponse.json({ error: 'channel_mismatch' }, { status: 422 });
  }
  if (await hasPendingPlaylistProposal(playlist.youtubePlaylistId)) {
    return NextResponse.json({ error: 'already_proposed' }, { status: 409 });
  }
  const gameName = (gameDoc.data()!.title as string) ?? '';

  await adminDb.collection('workflows').add(
    newWorkflowRecord(PLAYLIST_PROPOSAL_TYPE, auth.uid, {
      playlistUrl,
      youtubePlaylistId: playlist.youtubePlaylistId,
      title: playlist.title,
      thumbnailUrl: playlist.thumbnailUrl,
      itemCount: playlist.itemCount,
      channelId: channel.youtubeChannelId,
      channelName: channel.name,
      channelIconUrl: channel.iconUrl,
      gameId,
      gameName,
    }),
  );

  // 完了画面（§6.2）の表示用
  return NextResponse.json({
    title: playlist.title,
    thumbnailUrl: playlist.thumbnailUrl,
    channelName: channel.name,
    channelIconUrl: channel.iconUrl,
    gameName,
    videoCount: playlist.itemCount,
  });
}
