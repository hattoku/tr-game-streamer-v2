import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { normalizeForMatch } from '@/lib/exploration-rules';
import { GAME_PROPOSAL_TYPE, MAX_GAME_PROPOSAL_NOTE_LENGTH, MAX_GAME_TITLE_LENGTH } from '@/lib/proposal-shared';
import { newWorkflowRecord } from '@/lib/playlist-registration';

// ゲーム未設定の再生リストに付けたい「新しいゲームタイトル」の提案API（再生リスト詳細仕様書 v1.16。審査あり）。
// 既存のゲームから選べない場合の入口。表記ゆれの重複を避けるため、運営が審査して、新規登録するか既存に付ける。
// - 使えるのは gameId が null の再生リストだけ
// - 同じ再生リストに審査中の提案があれば 409 already_proposed
// - 同名（タイトル・別名の正規化一致）のゲームが既にあれば 409 game_exists（一覧から選んでもらう）
// - 1人あたり直近24時間に5件まで（429）
const DAILY_LIMIT = 5;

function validId(id: string): boolean {
  return /^[\w-]{1,128}$/.test(id) && !/^__.*__$/.test(id);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ playlistId: string }> }) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { playlistId } = await params;
  const raw = await request.json().catch(() => null);
  const body = raw && typeof raw === 'object' ? (raw as { gameTitle?: unknown; note?: unknown }) : {};
  const gameTitle = typeof body.gameTitle === 'string' ? body.gameTitle.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!validId(playlistId) || !gameTitle || !normalizeForMatch(gameTitle)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  if (gameTitle.length > MAX_GAME_TITLE_LENGTH) return NextResponse.json({ error: 'game_title_too_long' }, { status: 400 });
  if (note.length > MAX_GAME_PROPOSAL_NOTE_LENGTH) return NextResponse.json({ error: 'note_too_long' }, { status: 400 });

  const playlistSnap = await adminDb.collection('playlists').doc(playlistId).get();
  if (!playlistSnap.exists) return NextResponse.json({ error: 'playlist_not_found' }, { status: 404 });
  const playlist = playlistSnap.data()!;
  if (playlist.gameId) return NextResponse.json({ error: 'already_set' }, { status: 409 });

  // 同じ再生リストへの審査中の提案（等価条件だけで読み、状態はここで絞る）
  const forPlaylist = await adminDb
    .collection('workflows')
    .where('type', '==', GAME_PROPOSAL_TYPE)
    .where('proposalData.playlistId', '==', playlistId)
    .get();
  if (forPlaylist.docs.some((d) => d.data().status === 'reviewing_lv1' || d.data().status === 'reviewing_lv2')) {
    return NextResponse.json({ error: 'already_proposed' }, { status: 409 });
  }

  // 同名のゲームが既にあれば、一覧から選んでもらう
  const key = normalizeForMatch(gameTitle);
  const games = await adminDb.collection('games').select('title', 'aliases').get();
  if (games.docs.some((g) => [g.data().title as string, ...((g.data().aliases as string[] | undefined) ?? [])].some((n) => normalizeForMatch(n ?? '') === key))) {
    return NextResponse.json({ error: 'game_exists' }, { status: 409 });
  }

  const since = Date.now() - 24 * 60 * 60 * 1000;
  const mine = await adminDb.collection('workflows').where('type', '==', GAME_PROPOSAL_TYPE).where('submittedBy', '==', auth.uid).get();
  if (mine.docs.filter((d) => (d.data().submittedAt?.toMillis?.() ?? 0) >= since).length >= DAILY_LIMIT) {
    return NextResponse.json({ error: 'daily_limit' }, { status: 429 });
  }

  await adminDb.collection('workflows').add(
    newWorkflowRecord(GAME_PROPOSAL_TYPE, auth.uid, {
      gameTitle,
      note: note || null,
      playlistId,
      playlistTitle: (playlist.title as string) ?? '',
    }),
  );
  return NextResponse.json({ ok: true });
}
