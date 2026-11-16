import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/api-auth';
import { adminDb } from '../../../../lib/firebase-admin';
import { fetchValidPlaylist, registerPlaylist } from '../../../../lib/playlist-registration';
import { publishExistingPlaylist } from '../../../../lib/propose-server';
import { restoreChannelPlaylists } from '../../../../lib/listing-server';
import { activateListingChannel, getListingChannel, importChannelAfterResponse } from '../../../../lib/channel-application-server';

// 再生リストの本登録API（管理者専用。ページ 提案する 仕様書 §9）。プレビュー時の情報をそのまま信用せず、
// YouTube APIとFirestoreの状態をサーバー側で取り直してから書き込む（lib/playlist-registration.ts）。
// - `playlistId`: 提案ページの一覧から選んだ、すでに `playlists` にある掲載していない再生リストを、その場で掲載する（「公開する」）。
//   運営が手で外したものも管理者は掲載できる。
// - `playlistUrl`: URL 入力。`playlists` にすでにあって掲載していなければ上と同じ。無ければ新しく登録する。
//   掲載していないチャンネルの再生リストは `addChannel: true` のときだけ、チャンネルも掲載チャンネルに加えて登録する
//   （掲載方法「確認してから掲載」、ページ 再生リストを追加する 仕様書 §10.4）。掲載を止めているチャンネルは登録できない。
// ゲームタイトルは任意（`gameId` が無ければゲーム未設定）。新規チャンネルの説明文は管理者の手入力（`channelDescription`、任意）。
// チャンネル詳細ページから流入した場合は `sourceChannelId` を受け取り、再生リストのチャンネルと一致しなければ登録を拒否する。
// 一般ユーザーの提案は /api/playlists/propose、提案の承認は /api/admin/workflows/[workflowId]（同じ登録処理を使う）。
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = await request.json().catch(() => ({}));
  const { playlistUrl, playlistId, channelDescription, sourceChannelId } = body;
  const gameId = typeof body.gameId === 'string' && body.gameId ? body.gameId : null;
  const byId = typeof playlistId === 'string' && playlistId ? playlistId : null;
  if (!byId && typeof playlistUrl !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  if (byId) {
    const snap = await adminDb.collection('playlists').doc(byId).get();
    if (snap.exists && typeof sourceChannelId === 'string' && sourceChannelId && sourceChannelId !== snap.data()!.channelId) {
      return NextResponse.json({ error: 'channel_mismatch' }, { status: 422 });
    }
    const result = await publishExistingPlaylist({ playlistId: byId, gameId, uid: auth.uid, allowHidden: true });
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  }

  const valid = await fetchValidPlaylist(playlistUrl as string);
  if ('error' in valid) return NextResponse.json({ error: valid.error, message: valid.message }, { status: valid.status });
  const { playlist, channel } = valid;
  if (typeof sourceChannelId === 'string' && sourceChannelId && sourceChannelId !== channel.youtubeChannelId) {
    return NextResponse.json({ error: 'channel_mismatch' }, { status: 422 });
  }

  const existing = await adminDb.collection('playlists').doc(playlist.youtubePlaylistId).get();
  if (existing.exists && (existing.data()!.listingStatus ?? 'listed') === 'listed') {
    return NextResponse.json({ error: 'already_registered' }, { status: 409 });
  }

  // 掲載中の再生リストは必ず掲載チャンネルに属するようにする（§10.4）。すでにある再生リスト（チャンネルが未掲載なら channel_off）でも同じ
  const listing = await getListingChannel(channel.youtubeChannelId);
  if (listing.status === 'opted_out') return NextResponse.json({ error: 'channel_opted_out' }, { status: 409 });
  let explorationChannelId: string | null = listing.status === 'active' && listing.doc ? listing.doc.id : null;
  let activated = false;
  if (!explorationChannelId) {
    if (body.addChannel !== true) return NextResponse.json({ error: 'channel_not_listed' }, { status: 409 });
    explorationChannelId = await activateListingChannel({
      youtubeChannelId: channel.youtubeChannelId,
      authorizedVia: 'admin',
      uid: auth.uid,
      applicationWorkflowId: null,
      existing: listing.doc ?? listing.docs[0] ?? null,
      fallback: { title: channel.name, iconUrl: channel.iconUrl, subscriberCount: null },
    });
    activated = true;
    // チャンネルを外していた頃に channel_off にした再生リストを元の掲載状態に戻す（掲載チャンネル画面で戻すときと同じ）
    await restoreChannelPlaylists(explorationChannelId, channel.youtubeChannelId);
  }

  // すでに `playlists` にある掲載していない再生リストは、その場で掲載にする
  if (existing.exists) {
    // 上で元の状態に戻した結果すでに掲載中になっていれば、それで済み（完了画面の表示用に今の値を返す）
    const now = (await existing.ref.get()).data()!;
    if (activated && now.listingStatus === 'listed') {
      if (explorationChannelId) importChannelAfterResponse(explorationChannelId, auth.uid, '再生リスト登録でのチャンネル同時掲載');
      return NextResponse.json({
        playlistId: existing.id,
        title: (now.title as string) ?? '',
        thumbnailUrl: (now.thumbnailUrl as string) ?? '',
        channelName: (now.channelName as string) ?? '',
        channelIconUrl: (now.channelIconUrl as string) ?? '',
        gameName: (now.gameName as string) ?? '',
        videoCount: (now.videoCount as number) ?? 0,
      });
    }
    const result = await publishExistingPlaylist({ playlistId: existing.id, gameId, uid: auth.uid, allowHidden: true });
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
    if (activated && explorationChannelId) importChannelAfterResponse(explorationChannelId, auth.uid, '再生リスト登録でのチャンネル同時掲載');
    return NextResponse.json(result);
  }

  const result = await registerPlaylist({
    playlistUrl: playlistUrl as string,
    gameId,
    channelDescription,
    sourceChannelId,
    registeredBy: auth.uid,
    proposedBy: null,
    explorationChannelId,
  });
  if ('error' in result) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  // チャンネルを新しく掲載したら、ほかの再生リストを1回取り込む（応答のあと。失敗しても登録は取り消さない）
  if (activated && explorationChannelId) importChannelAfterResponse(explorationChannelId, auth.uid, '再生リスト登録でのチャンネル同時掲載');
  return NextResponse.json(result);
}
