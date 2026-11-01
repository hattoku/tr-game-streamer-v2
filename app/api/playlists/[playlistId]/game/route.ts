import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { linkPlaylistToGame } from '@/lib/playlist-game-linking';

// ゲーム未設定の再生リストに、一般ユーザーが既存のゲームを登録するAPI（審査なし。再生リスト詳細仕様書 §ゲーム未設定、
// 収集候補レビューUI仕様書 v3.2 §6.5）。みんなで作る場なので審査は置かず、荒らされにくい形にしている。
// - 使えるのは gameId が null の再生リストだけ（一度付いたら一般ユーザーは変えられない。先に付いていれば 409）
// - 新しいゲームタイトルは作れない（既存のゲームだけ。表記ゆれの重複の入り口になるため、新規は今までどおり審査）
// - 1人1日（日本時間の暦日）20件まで（429。game_link_counters をリンクと同じトランザクションで数える）
// - 管理者が「違う」と外したゲーム（rejectedGameIds）は選べない（409 rejected_game）
// - 付けた履歴は playlist_game_changes に残り、管理画面の「ゲーム未設定」から戻せる

export async function POST(request: NextRequest, { params }: { params: Promise<{ playlistId: string }> }) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { playlistId } = await params;
  const raw = await request.json().catch(() => null);
  const gameId = raw && typeof raw === 'object' && typeof (raw as { gameId?: unknown }).gameId === 'string' ? (raw as { gameId: string }).gameId : '';
  // Firestore のドキュメントIDとして使える形だけ通す（予約形式 __x__ ・長すぎるIDは弾く）
  const validId = (id: string) => /^[\w-]{1,128}$/.test(id) && !/^__.*__$/.test(id);
  if (!validId(playlistId) || !validId(gameId)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const result = await linkPlaylistToGame(playlistId, gameId, 'user', auth.uid);
  if (result === 'linked') return NextResponse.json({ ok: true });
  const status = { already_set: 409, rejected_game: 409, daily_limit: 429, playlist_not_found: 404, game_not_found: 404 }[result];
  return NextResponse.json({ error: result }, { status });
}
