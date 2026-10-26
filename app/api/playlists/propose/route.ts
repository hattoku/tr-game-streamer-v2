import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/api-auth';
import { adminDb } from '../../../../lib/firebase-admin';
import { fetchValidPlaylist, hasPendingPlaylistProposal, newWorkflowRecord } from '../../../../lib/playlist-registration';
import {
  MAX_GAME_PROPOSAL_NOTE_LENGTH,
  MAX_GAME_TITLE_LENGTH,
  PLAYLIST_PROPOSAL_TYPE,
  type ProposalRakutenItem,
} from '../../../../lib/proposal-shared';
import { PLATFORM_OPTIONS } from '../../../../lib/game-shared';
import { normalizeRakutenBooksItemUrl } from '../../../../lib/rakuten-shared';

// 新しいゲームタイトルで楽天ブックスの候補を選んだ場合の商品情報（§9.2 v4.0）。審査時の登録モーダルの自動セットに使うだけだが、
// 画像URLはそのまま games に入りうるため楽天の画像ドメインに限る。形が合わなければ null（提案自体は受け付ける）
function parseRakutenItem(value: unknown): ProposalRakutenItem | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const itemUrl = typeof v.itemUrl === 'string' ? normalizeRakutenBooksItemUrl(v.itemUrl) : null;
  const title = typeof v.title === 'string' ? v.title.trim().slice(0, 300) : '';
  if (!itemUrl || !title) return null;
  let imageUrl = '';
  if (typeof v.imageUrl === 'string') {
    try {
      const u = new URL(v.imageUrl);
      if (u.protocol === 'https:' && (u.hostname === 'rakuten.co.jp' || u.hostname.endsWith('.rakuten.co.jp'))) imageUrl = u.toString();
    } catch {
      // 画像URLが不正なら画像なしで扱う
    }
  }
  return {
    itemUrl,
    title,
    imageUrl,
    hardware: typeof v.hardware === 'string' ? v.hardware.trim().slice(0, 50) : '',
    booksGenreId: typeof v.booksGenreId === 'string' && /^[\d/]{1,100}$/.test(v.booksGenreId) ? v.booksGenreId : '',
  };
}

// 一般ユーザーの再生リスト登録提案API（ページ 再生リストを追加する 仕様書 §5.4、フェーズ7ステップ7-4）。
// 本番の `playlists` には書かず、`workflows`（type: "playlist_register"、ステータス「審査中」）に保存する。
// 承認・却下は管理画面（/admin/workflows、単一ステップ。管理 審査ワークフロー仕様書 §14）で行い、
// 承認時に /api/playlists/register と同じ登録処理（lib/playlist-registration.ts）が走る。
// 制約チェック（§4.1.5・§5.2）は登録と同じ順序でサーバー側でも行う（クライアントの判定を信用しない）。
// ゲームタイトルは既存の `gameId` か、候補に無い場合の新しいゲームタイトル `newGameTitle`（＋`newGameNote`）のどちらか
// （§4.2.2 v3.15。ゲームタイトルと再生リストを1件の提案として同時に送る）。新しいゲームタイトルには任意で機種（`newGamePlatforms`）と、
// 楽天ブックスの候補から選んだ場合の商品情報（`newGameRakuten`）を付けられる（§9.2 v4.0）。
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { playlistUrl, gameId, newGameTitle, newGameNote, newGamePlatforms, newGameRakuten, sourceChannelId } = await request.json();
  const existingGameId = typeof gameId === 'string' && gameId ? gameId : null;
  const newTitle = typeof newGameTitle === 'string' ? newGameTitle.trim() : '';
  const newNote = typeof newGameNote === 'string' ? newGameNote.trim() : '';
  const newPlatforms = Array.isArray(newGamePlatforms)
    ? [...new Set(newGamePlatforms.filter((p: unknown): p is string => typeof p === 'string' && PLATFORM_OPTIONS.includes(p)))]
    : [];
  const newRakuten = parseRakutenItem(newGameRakuten);
  if (typeof playlistUrl !== 'string' || (!existingGameId && !newTitle)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  if (!existingGameId) {
    // §4.2.2 バリデーション
    if (newTitle.length > MAX_GAME_TITLE_LENGTH) return NextResponse.json({ error: 'game_title_too_long' }, { status: 400 });
    if (newNote.length > MAX_GAME_PROPOSAL_NOTE_LENGTH) return NextResponse.json({ error: 'note_too_long' }, { status: 400 });
  }

  const valid = await fetchValidPlaylist(playlistUrl);
  if ('error' in valid) {
    return NextResponse.json({ error: valid.error, message: valid.message }, { status: valid.status });
  }
  const { playlist, channel } = valid;

  const [playlistDoc, gameDoc, sameTitleGames] = await Promise.all([
    adminDb.collection('playlists').doc(playlist.youtubePlaylistId).get(),
    existingGameId ? adminDb.collection('games').doc(existingGameId).get() : null,
    // 新しいゲームタイトルでも、同名（完全一致）がすでにマスタにあれば一覧から選んでもらう（マスタ管理仕様書 §7.1 と同じ判定）
    existingGameId ? null : adminDb.collection('games').where('title', '==', newTitle).limit(1).get(),
  ]);
  // §7.2 一般ユーザー固有エラー: 審査中の提案がある・登録済みは同じ文言で返す
  if (playlistDoc.exists) {
    return NextResponse.json({ error: 'already_proposed' }, { status: 409 });
  }
  if (gameDoc && !gameDoc.exists) {
    return NextResponse.json({ error: 'game_not_found' }, { status: 404 });
  }
  if (sameTitleGames && !sameTitleGames.empty) {
    return NextResponse.json({ error: 'game_exists' }, { status: 409 });
  }
  if (typeof sourceChannelId === 'string' && sourceChannelId && sourceChannelId !== channel.youtubeChannelId) {
    return NextResponse.json({ error: 'channel_mismatch' }, { status: 422 });
  }
  if (await hasPendingPlaylistProposal(playlist.youtubePlaylistId)) {
    return NextResponse.json({ error: 'already_proposed' }, { status: 409 });
  }
  const gameName = gameDoc ? ((gameDoc.data()!.title as string) ?? '') : null;

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
      gameId: existingGameId,
      gameName,
      ...(existingGameId
        ? {}
        : { newGameTitle: newTitle, newGameNote: newNote || null, newGamePlatforms: newPlatforms, newGameRakuten: newRakuten }),
    }),
  );

  // 完了画面（§6.2）の表示用
  return NextResponse.json({
    title: playlist.title,
    thumbnailUrl: playlist.thumbnailUrl,
    channelName: channel.name,
    channelIconUrl: channel.iconUrl,
    gameName: gameName ?? newTitle,
    videoCount: playlist.itemCount,
  });
}
