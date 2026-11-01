import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { autoLinkUnsetPlaylists, linkPlaylistToGame, unlinkPlaylistGame } from '@/lib/playlist-game-linking';

// ゲーム未設定の再生リストの管理API（管理者専用。収集候補レビューUI仕様書 v2.4 §3.9・§6）。
//   link   { playlistId, gameId }  ゲームを付ける（すでに付いていれば 409）
//   unlink { playlistId }          ゲームを外して未設定に戻す（外したゲームは自動では付け直さない）
//   relink {}                      ゲーム未設定の再生リストをいますぐ照合する
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = (await request.json().catch(() => ({}))) as { action?: unknown; playlistId?: unknown; gameId?: unknown };
  const playlistId = typeof body.playlistId === 'string' ? body.playlistId : '';
  const gameId = typeof body.gameId === 'string' ? body.gameId : '';

  if (body.action === 'relink') {
    return NextResponse.json(await autoLinkUnsetPlaylists());
  }
  if (!/^[\w-]+$/.test(playlistId)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  if (body.action === 'link') {
    if (!/^[\w-]+$/.test(gameId)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    const result = await linkPlaylistToGame(playlistId, gameId, 'admin', auth.uid);
    if (result === 'linked') return NextResponse.json({ ok: true });
    return NextResponse.json({ error: result }, { status: result === 'already_set' ? 409 : 404 });
  }
  if (body.action === 'unlink') {
    const result = await unlinkPlaylistGame(playlistId, auth.uid);
    if (result === 'unlinked') return NextResponse.json({ ok: true });
    return NextResponse.json({ error: result }, { status: result === 'not_set' ? 409 : 404 });
  }
  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
