import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/api-auth';
import { adminDb } from '../../../../lib/firebase-admin';
import { extractPlaylistId } from '../../../../lib/youtube';
import { newWorkflowRecord } from '../../../../lib/playlist-registration';
import { GAME_PROPOSAL_TYPE, MAX_GAME_PROPOSAL_NOTE_LENGTH, MAX_GAME_TITLE_LENGTH } from '../../../../lib/proposal-shared';

// ゲームタイトル追加提案API（ページ 再生リストを追加する 仕様書 §4.2.2、フェーズ7ステップ7-4）。
// `workflows`（type: "game_title_register"、ステータス「審査中」）に保存する。管理者は承認時に
// GameCreateModal でゲームタイトルを登録し、続けて同じ提案の再生リストも登録できる（/admin/workflows）。
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = await request.json();
  const playlistUrl = typeof body.playlistUrl === 'string' ? body.playlistUrl.trim() : '';
  const gameTitle = typeof body.gameTitle === 'string' ? body.gameTitle.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';

  // §4.2.2 バリデーション（クライアントと同じ判定をサーバーでも行う）
  if (!playlistUrl) return NextResponse.json({ error: 'playlist_url_required' }, { status: 400 });
  if (!extractPlaylistId(playlistUrl)) return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
  if (!gameTitle) return NextResponse.json({ error: 'game_title_required' }, { status: 400 });
  if (gameTitle.length > MAX_GAME_TITLE_LENGTH) return NextResponse.json({ error: 'game_title_too_long' }, { status: 400 });
  if (note.length > MAX_GAME_PROPOSAL_NOTE_LENGTH) return NextResponse.json({ error: 'note_too_long' }, { status: 400 });

  // 同名タイトルがすでにマスタにあるなら提案不要（マスタ管理仕様書 §7.1 と同じ完全一致判定）
  const sameTitle = await adminDb.collection('games').where('title', '==', gameTitle).limit(1).get();
  if (!sameTitle.empty) {
    return NextResponse.json({ error: 'game_exists' }, { status: 409 });
  }

  await adminDb.collection('workflows').add(
    newWorkflowRecord(GAME_PROPOSAL_TYPE, auth.uid, { playlistUrl, gameTitle, note: note || null }),
  );
  return NextResponse.json({ ok: true });
}
