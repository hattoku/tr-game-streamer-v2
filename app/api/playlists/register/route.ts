import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/api-auth';
import { registerPlaylist } from '../../../../lib/playlist-registration';

// 再生リストの本登録API（管理者専用）。プレビュー時の情報をそのまま信用せず、
// YouTube APIとFirestoreの状態をサーバー側で取り直してから書き込む（lib/playlist-registration.ts）。
// AI説明文自動生成（仕様書4.1.4節）はスコープ外のため、新規チャンネルの説明文は
// 管理者の手入力（channelDescription、任意）をそのまま保存する。
// チャンネル詳細ページから流入した場合は `sourceChannelId`（任意）を受け取り、再生リストのチャンネルと
// 一致しなければ登録を拒否する（仕様書5.2節「流入元チャンネル一致」。クライアント側の判定を信用しない二重チェック）。
// 一般ユーザーの提案は /api/playlists/propose、提案の承認は /api/admin/workflows/[workflowId]（同じ登録処理を使う）。
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { playlistUrl, gameId, channelDescription, sourceChannelId } = await request.json();
  if (typeof playlistUrl !== 'string' || typeof gameId !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const result = await registerPlaylist({
    playlistUrl,
    gameId,
    channelDescription,
    sourceChannelId,
    registeredBy: auth.uid,
    proposedBy: null,
  });
  if ('error' in result) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json(result);
}
