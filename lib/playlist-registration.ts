import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import {
  extractPlaylistId,
  fetchChannelSnippet,
  fetchPlaylistItems,
  fetchPlaylistSnippet,
  fetchVideoDurations,
  YouTubeApiError,
  type ChannelSnippet,
  type PlaylistSnippet,
} from './youtube';
import { PLAYLIST_PROPOSAL_TYPE } from './proposal-shared';

// 再生リストの登録・提案で共通のサーバー側処理（ページ 再生リストを追加する 仕様書 §4.1.5・§5）。
// 管理者の直接登録（/api/playlists/register）、一般ユーザーの提案（/api/playlists/propose）、
// 提案の承認（/api/admin/workflows/[workflowId]）、コンテンツ収集の承認（/api/admin/collection/candidates、
// 収集候補レビューUI仕様書 v2.0 §4）から使う。プレビュー時の情報は信用せず、
// YouTube API と Firestore の状態を毎回サーバー側で取り直す。

export type PlaylistApiError = { error: string; status: number; message?: string };


/**
 * URL形式 → YouTube API取得 → 公開状態 の順でチェックし、再生リストとチャンネルの情報を返す（§5.2 の前半）。
 * チャンネル一致（§4.1.5）は、再生リストの channelId でチャンネルを引くため構造的に満たされる。
 */
export async function fetchValidPlaylist(
  playlistUrl: string,
): Promise<{ playlist: PlaylistSnippet; channel: ChannelSnippet } | PlaylistApiError> {
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) return { error: 'invalid_url', status: 400 };

  let playlist;
  try {
    playlist = await fetchPlaylistSnippet(playlistId);
  } catch (e) {
    const message = e instanceof YouTubeApiError ? e.message : 'youtube_api_error';
    return { error: 'youtube_api_error', status: 502, message };
  }
  if (!playlist) return { error: 'playlist_not_found', status: 404 };
  if (!playlist.isPublic) return { error: 'not_public', status: 422 };

  const channel = await fetchChannelSnippet(playlist.channelId);
  if (!channel) return { error: 'channel_not_found', status: 502 };

  return { playlist, channel };
}

/** 審査中の再生リスト登録提案があるか（§7.2「すでに提案済み」）。却下された提案は数えない（再提案できる） */
export async function hasPendingPlaylistProposal(youtubePlaylistId: string): Promise<boolean> {
  // type と proposalData.youtubePlaylistId の等価条件のみ（単一フィールドインデックスのマージで足りる）。
  // ステータスはメモリ上で絞る
  const snap = await adminDb
    .collection('workflows')
    .where('type', '==', PLAYLIST_PROPOSAL_TYPE)
    .where('proposalData.youtubePlaylistId', '==', youtubePlaylistId)
    .get();
  return snap.docs.some((d) => {
    const status = d.data().status;
    return status === 'reviewing_lv1' || status === 'reviewing_lv2';
  });
}

export interface RegisteredPlaylist {
  playlistId: string;
  title: string;
  thumbnailUrl: string;
  channelName: string;
  channelIconUrl: string;
  gameName: string;
  videoCount: number;
}

/**
 * 再生リストを本番の `playlists`（と `videos`・`channels`・`games.playlistCount`）に登録する（§5.1 管理者の分岐・§5.3）。
 * `proposedBy` は提案の承認で登録するときの提案者（直接登録は null）。
 */
export async function registerPlaylist(params: {
  playlistUrl: string;
  /** null は「ゲーム未設定」（ゲームタイトルを紐づけずに登録する。収集候補レビューUI仕様書 v2.4 §3.9） */
  gameId: string | null;
  /** ゲーム未設定のときの、未確定のゲーム名（`playlists.gameHint`。キーワード検索とあとの自動照合に使う） */
  gameHint?: string | null;
  channelDescription?: unknown;
  sourceChannelId?: unknown;
  registeredBy: string;
  proposedBy: string | null;
  /** 固定タグとして付けるタグID（運営者タグ。存在確認は呼び出し側で行う） */
  fixedTagIds?: string[];
}): Promise<RegisteredPlaylist | PlaylistApiError> {
  const { playlistUrl, gameId, channelDescription, sourceChannelId, registeredBy, proposedBy } = params;
  const gameHint = gameId ? null : params.gameHint?.trim().slice(0, 100) || null;
  const fixedTagIds = [...new Set(params.fixedTagIds ?? [])];

  const valid = await fetchValidPlaylist(playlistUrl);
  if ('error' in valid) return valid;
  const { playlist, channel } = valid;

  const playlistRef = adminDb.collection('playlists').doc(playlist.youtubePlaylistId);
  const channelRef = adminDb.collection('channels').doc(channel.youtubeChannelId);
  const gameRef = gameId ? adminDb.collection('games').doc(gameId) : null;

  const [playlistDoc, channelDoc, gameDoc] = await Promise.all([
    playlistRef.get(),
    channelRef.get(),
    gameRef ? gameRef.get() : Promise.resolve(null),
  ]);

  if (playlistDoc.exists) return { error: 'already_registered', status: 409 };
  if (gameDoc && !gameDoc.exists) return { error: 'game_not_found', status: 404 };
  // チェック順序（5.2節）: URL形式 → API取得 → 公開状態 → チャンネル一致 → ゲームタイトル選択 →
  // （チャンネル詳細流入時のみ）流入元チャンネル一致。この判定を最後に置くのはその順序に合わせるため
  if (typeof sourceChannelId === 'string' && sourceChannelId && sourceChannelId !== channel.youtubeChannelId) {
    return { error: 'channel_mismatch', status: 422 };
  }
  const game = gameDoc ? gameDoc.data()! : null;

  const items = await fetchPlaylistItems(playlist.youtubePlaylistId);
  const durations = await fetchVideoDurations(items.map((i) => i.youtubeVideoId));

  // Firestore の1バッチは500書き込みまで。長い再生リスト（有名チャンネルでは数百本）でも収まるよう、
  // 動画は400件ずつ先に書き込み、再生リスト本体・カウンタは最後の1バッチでまとめて確定する。
  // 途中で失敗しても再生リスト本体が無いので一覧には出ず、再登録時は同じドキュメントIDに上書きされる
  const VIDEO_CHUNK_SIZE = 400;
  for (let start = 0; start < items.length; start += VIDEO_CHUNK_SIZE) {
    const videoBatch = adminDb.batch();
    for (const item of items.slice(start, start + VIDEO_CHUNK_SIZE)) {
      const videoRef = adminDb.collection('videos').doc(`${playlist.youtubePlaylistId}_${item.youtubeVideoId}`);
      videoBatch.set(videoRef, {
        youtubeVideoId: item.youtubeVideoId,
        playlistId: playlist.youtubePlaylistId,
        position: item.position,
        title: item.title,
        thumbnailUrl: item.thumbnailUrl,
        durationSeconds: durations.get(item.youtubeVideoId) ?? null,
        publishedAt: new Date(item.publishedAt),
        playStartCount: 0,
      });
    }
    await videoBatch.commit();
  }

  const now = new Date();
  const batch = adminDb.batch();

  if (channelDoc.exists) {
    batch.update(channelRef, { playlistCount: (channelDoc.data()!.playlistCount ?? 0) + 1 });
  } else {
    batch.set(channelRef, {
      youtubeChannelId: channel.youtubeChannelId,
      name: channel.name,
      iconUrl: channel.iconUrl,
      description: typeof channelDescription === 'string' && channelDescription.trim() ? channelDescription.trim() : null,
      isAiGeneratedDescription: false,
      subscriberCount: null,
      playlistCount: 1,
      registeredAt: now,
      lastFetchedAt: null,
    });
  }

  batch.set(playlistRef, {
    youtubePlaylistId: playlist.youtubePlaylistId,
    title: playlist.title,
    thumbnailUrl: playlist.thumbnailUrl,
    channelId: channel.youtubeChannelId,
    channelName: channel.name,
    channelIconUrl: channel.iconUrl,
    gameId,
    gameName: game?.title ?? '',
    gameGenreIds: game?.genreId ? [game.genreId] : [],
    gameHint,
    gameSetBy: gameId ? 'admin' : null,
    gameSetAt: gameId ? now : null,
    videoCount: items.length,
    latestVideoPublishedAt: items.length > 0
      ? items.reduce((latest, i) => (i.publishedAt > latest ? i.publishedAt : latest), items[0].publishedAt)
      : null,
    registeredAt: now,
    registeredBy,
    proposedBy,
    isPublic: true,
    score: null,
    reviewCount: 0,
    mylistCount: 0,
    playlistTagIds: fixedTagIds,
    playlistTagsFixed: fixedTagIds,
    referenceUrl: playlistUrl,
    lastFetchedAt: null,
  });

  for (const tagId of fixedTagIds) {
    batch.update(adminDb.collection('tags').doc(tagId), { usagePlaylistCount: FieldValue.increment(1) });
  }

  if (gameRef && game) batch.update(gameRef, { playlistCount: (game.playlistCount ?? 0) + 1 });

  await batch.commit();

  return {
    playlistId: playlist.youtubePlaylistId,
    title: playlist.title,
    thumbnailUrl: playlist.thumbnailUrl,
    channelName: channel.name,
    channelIconUrl: channel.iconUrl,
    gameName: game?.title ?? '',
    videoCount: items.length,
  };
}

/** `workflows` の新規レコード（ReportModal の通報と同じ形。提案系は API からのみ作る） */
export function newWorkflowRecord(type: string, submittedBy: string, proposalData: Record<string, unknown>) {
  const now = new Date();
  return {
    type,
    status: 'reviewing_lv1',
    submittedBy,
    genreId: null,
    step1AssignedOperatorIds: [],
    proposalData,
    reportData: null,
    step1History: [],
    step1Errors: [],
    step2History: [],
    editHistory: [],
    operatorMemo: null,
    submittedAt: now,
    updatedAt: now,
  };
}
