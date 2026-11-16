import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/api-auth';
import { adminDb } from '../../../../lib/firebase-admin';
import { fetchValidPlaylist, hasPendingPlaylistProposal, newWorkflowRecord } from '../../../../lib/playlist-registration';
import { getProposalChannelState } from '../../../../lib/channel-application-server';
import {
  MAX_GAME_PROPOSAL_NOTE_LENGTH,
  MAX_GAME_TITLE_LENGTH,
  PLAYLIST_PROPOSAL_TYPE,
  type ProposalRakutenItem,
} from '../../../../lib/proposal-shared';
import { PLATFORM_OPTIONS } from '../../../../lib/game-shared';
import { normalizeRakutenBooksItemUrl } from '../../../../lib/rakuten-shared';
import { canProposeExisting, isHiddenByAdmin } from '../../../../lib/propose-server';
import { MAX_PROPOSE_REASON_LENGTH } from '../../../../lib/propose-shared';

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

// 一般ユーザーの再生リスト登録提案API（ページ 再生リストを追加する 仕様書 §5.4、ページ 提案する 仕様書 §5.5）。
// 本番の `playlists` には書かず、`workflows`（type: "playlist_register"、ステータス「審査中」）に保存する。
// 承認・却下は管理画面（/admin/workflows、単一ステップ。管理 審査ワークフロー仕様書 §14・§15.3）で行う。
// 2つの形で受け付ける:
// - `playlistId`: 提案ページの一覧から選んだ、すでに `playlists` にある（巡回で取り込んだ）掲載していない再生リスト。
//   承認で掲載（listed）になる（審査ワークフロー仕様書 §15.3）。運営が手で外したものは受け付けない。
// - `playlistUrl`: 一覧に無いときの URL 入力（今までの提案）。`playlists` にすでにあって掲載していなければ、上と同じ扱いにする。
// 制約チェックはサーバー側でも行う（クライアントの判定を信用しない）。
// ゲームタイトルは任意（ページ 提案する 仕様書 §5.4）: 既存の `gameId`、候補に無い場合の新しいゲームタイトル `newGameTitle`（＋`newGameNote`・
// 機種 `newGamePlatforms`・楽天の商品 `newGameRakuten`）、どちらも無ければ `noGame: true`。
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = await request.json().catch(() => ({}));
  const { playlistUrl, playlistId, gameId, newGameTitle, newGameNote, newGamePlatforms, newGameRakuten, sourceChannelId } = body;
  const existingGameId = typeof gameId === 'string' && gameId ? gameId : null;
  const newTitle = typeof newGameTitle === 'string' ? newGameTitle.trim() : '';
  const newNote = typeof newGameNote === 'string' ? newGameNote.trim() : '';
  const proposeReason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const newPlatforms = Array.isArray(newGamePlatforms)
    ? [...new Set(newGamePlatforms.filter((p: unknown): p is string => typeof p === 'string' && PLATFORM_OPTIONS.includes(p)))]
    : [];
  const newRakuten = parseRakutenItem(newGameRakuten);
  const byId = typeof playlistId === 'string' && playlistId ? playlistId : null;
  if (!byId && typeof playlistUrl !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  if (!existingGameId && newTitle) {
    // §4.2.2 バリデーション
    if (newTitle.length > MAX_GAME_TITLE_LENGTH) return NextResponse.json({ error: 'game_title_too_long' }, { status: 400 });
    if (newNote.length > MAX_GAME_PROPOSAL_NOTE_LENGTH) return NextResponse.json({ error: 'note_too_long' }, { status: 400 });
  }
  if (proposeReason.length > MAX_PROPOSE_REASON_LENGTH) return NextResponse.json({ error: 'reason_too_long' }, { status: 400 });

  // 再生リストを特定する。一覧から選んだもの（byId）は playlists のドキュメント、URL は YouTube から取り直す
  let target: {
    youtubePlaylistId: string;
    playlistUrl: string;
    title: string;
    thumbnailUrl: string;
    itemCount: number;
    channelId: string;
    channelName: string;
    channelIconUrl: string;
  };
  let existing: FirebaseFirestore.DocumentData | null = null;
  if (byId) {
    const snap = await adminDb.collection('playlists').doc(byId).get();
    if (!snap.exists) return NextResponse.json({ error: 'playlist_not_found' }, { status: 404 });
    existing = snap.data()!;
    target = {
      youtubePlaylistId: snap.id,
      playlistUrl: (existing.referenceUrl as string) || `https://www.youtube.com/playlist?list=${snap.id}`,
      title: (existing.title as string) ?? '',
      thumbnailUrl: (existing.thumbnailUrl as string) ?? '',
      itemCount: typeof existing.videoCount === 'number' ? existing.videoCount : 0,
      channelId: (existing.channelId as string) ?? '',
      channelName: (existing.channelName as string) ?? '',
      channelIconUrl: (existing.channelIconUrl as string) ?? '',
    };
  } else {
    const valid = await fetchValidPlaylist(playlistUrl as string);
    if ('error' in valid) {
      return NextResponse.json({ error: valid.error, message: valid.message }, { status: valid.status });
    }
    const { playlist, channel } = valid;
    target = {
      youtubePlaylistId: playlist.youtubePlaylistId,
      playlistUrl: playlistUrl as string,
      title: playlist.title,
      thumbnailUrl: playlist.thumbnailUrl,
      itemCount: playlist.itemCount,
      channelId: channel.youtubeChannelId,
      channelName: channel.name,
      channelIconUrl: channel.iconUrl,
    };
    const snap = await adminDb.collection('playlists').doc(playlist.youtubePlaylistId).get();
    existing = snap.exists ? snap.data()! : null;
  }

  // すでにプレミテにある再生リスト: 掲載中は「登録済み」、運営が外したものは受け付けない、それ以外は掲載の提案にする
  if (existing) {
    if ((existing.listingStatus ?? 'listed') === 'listed') return NextResponse.json({ error: 'already_proposed' }, { status: 409 });
    if (isHiddenByAdmin(existing)) return NextResponse.json({ error: 'hidden_by_admin' }, { status: 409 });
    if (!canProposeExisting(existing)) return NextResponse.json({ error: 'not_proposable' }, { status: 409 });
  }

  const [gameDoc, sameTitleGames] = await Promise.all([
    existingGameId ? adminDb.collection('games').doc(existingGameId).get() : null,
    // 新しいゲームタイトルでも、同名（完全一致）がすでにマスタにあれば一覧から選んでもらう（マスタ管理仕様書 §7.1 と同じ判定）
    !existingGameId && newTitle ? adminDb.collection('games').where('title', '==', newTitle).limit(1).get() : null,
  ]);
  if (gameDoc && !gameDoc.exists) {
    return NextResponse.json({ error: 'game_not_found' }, { status: 404 });
  }
  if (sameTitleGames && !sameTitleGames.empty) {
    return NextResponse.json({ error: 'game_exists' }, { status: 409 });
  }
  if (typeof sourceChannelId === 'string' && sourceChannelId && sourceChannelId !== target.channelId) {
    return NextResponse.json({ error: 'channel_mismatch' }, { status: 422 });
  }
  // 提案できるのは掲載中のチャンネルの再生リストだけ（ページ 再生リストを追加する 仕様書 §10.1）。
  // 未掲載はチャンネルの推薦へ、掲載を止めているチャンネルは受け付けない
  const channelListing = await getProposalChannelState(target.channelId);
  if (channelListing !== 'listed') {
    return NextResponse.json({ error: channelListing === 'opted_out' ? 'channel_opted_out' : 'channel_not_listed' }, { status: 409 });
  }
  if (await hasPendingPlaylistProposal(target.youtubePlaylistId)) {
    return NextResponse.json({ error: 'already_proposed' }, { status: 409 });
  }
  const gameName = gameDoc ? ((gameDoc.data()!.title as string) ?? '') : null;
  const noGame = !existingGameId && !newTitle;

  await adminDb.collection('workflows').add(
    newWorkflowRecord(PLAYLIST_PROPOSAL_TYPE, auth.uid, {
      playlistUrl: target.playlistUrl,
      youtubePlaylistId: target.youtubePlaylistId,
      title: target.title,
      thumbnailUrl: target.thumbnailUrl,
      itemCount: target.itemCount,
      channelId: target.channelId,
      channelName: target.channelName,
      channelIconUrl: target.channelIconUrl,
      gameId: existingGameId,
      gameName,
      noGame,
      ...(existingGameId || noGame
        ? {}
        : { newGameTitle: newTitle, newGameNote: newNote || null, newGamePlatforms: newPlatforms, newGameRakuten: newRakuten }),
      // すでにプレミテにある再生リストの掲載の提案（審査ワークフロー仕様書 §15.3）。提案時点の掲載状態と理由
      ...(existing
        ? {
            existingListingStatus: (existing.listingStatus as string) ?? null,
            existingListingReason: (existing.listingReason as string | null) ?? null,
          }
        : {}),
      proposeReason: proposeReason || null,
    }),
  );

  // 完了画面の表示用
  return NextResponse.json({
    title: target.title,
    thumbnailUrl: target.thumbnailUrl,
    channelName: target.channelName,
    channelIconUrl: target.channelIconUrl,
    gameName: gameName ?? newTitle,
    videoCount: target.itemCount,
  });
}
