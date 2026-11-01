import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { linkPlaylistToGame } from '@/lib/playlist-game-linking';

// ゲーム未設定の再生リストに、一般ユーザーが既存のゲームを登録するAPI（審査なし。再生リスト詳細仕様書 §ゲーム未設定、
// 収集候補レビューUI仕様書 v2.5 §6.5）。みんなで作る場なので審査は置かず、荒らされにくい形にしている。
// - 使えるのは gameId が null の再生リストだけ（一度付いたら一般ユーザーは変えられない。先に付いていれば 409）
// - 新しいゲームタイトルは作れない（既存のゲームだけ。表記ゆれの重複の入り口になるため、新規は今までどおり審査）
// - 1人1日（直近24時間）20件まで（429）
// - 管理者が「違う」と外したゲーム（rejectedGameIds）は選べない（409 rejected_game）
// - 付けた履歴は playlist_game_changes に残り、管理画面の「ゲーム未設定」から戻せる
const DAILY_LIMIT = 20;

export async function POST(request: NextRequest, { params }: { params: Promise<{ playlistId: string }> }) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { playlistId } = await params;
  const body = (await request.json().catch(() => ({}))) as { gameId?: unknown };
  const gameId = typeof body.gameId === 'string' ? body.gameId : '';
  if (!/^[\w-]+$/.test(playlistId) || !/^[\w-]+$/.test(gameId)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const playlistSnap = await adminDb.collection('playlists').doc(playlistId).get();
  if (!playlistSnap.exists) return NextResponse.json({ error: 'playlist_not_found' }, { status: 404 });
  const playlist = playlistSnap.data()!;
  if (playlist.gameId) return NextResponse.json({ error: 'already_set' }, { status: 409 });
  if (((playlist.rejectedGameIds as string[] | undefined) ?? []).includes(gameId)) {
    return NextResponse.json({ error: 'rejected_game' }, { status: 409 });
  }

  // 直近24時間に自分が付けた件数（userId の等価条件だけで読み、期間はここで絞る。複合 index を増やさない）
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const mine = await adminDb.collection('playlist_game_changes').where('userId', '==', auth.uid).get();
  const recent = mine.docs.filter((d) => d.data().by === 'user' && (d.data().at?.toMillis?.() ?? 0) >= since).length;
  if (recent >= DAILY_LIMIT) return NextResponse.json({ error: 'daily_limit' }, { status: 429 });

  const result = await linkPlaylistToGame(playlistId, gameId, 'user', auth.uid);
  if (result === 'linked') return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result }, { status: result === 'already_set' ? 409 : 404 });
}
