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
// 提案の承認（/api/admin/workflows/[workflowId]）から使う。プレビュー時の情報は信用せず、
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
  gameId: string;
  channelDescription?: unknown;
  sourceChannelId?: unknown;
  registeredBy: string;
  proposedBy: string | null;
}): Promise<RegisteredPlaylist | PlaylistApiError> {
  const { playlistUrl, gameId, channelDescription, sourceChannelId, registeredBy, proposedBy } = params;

  const valid = await fetchValidPlaylist(playlistUrl);
  if ('error' in valid) return valid;
  const { playlist, channel } = valid;

  const playlistRef = adminDb.collection('playlists').doc(playlist.youtubePlaylistId);
  const channelRef = adminDb.collection('channels').doc(channel.youtubeChannelId);
  const gameRef = adminDb.collection('games').doc(gameId);

  const [playlistDoc, channelDoc, gameDoc] = await Promise.all([
    playlistRef.get(),
    channelRef.get(),
    gameRef.get(),
  ]);

  if (playlistDoc.exists) return { error: 'already_registered', status: 409 };
  if (!gameDoc.exists) return { error: 'game_not_found', status: 404 };
  // チェック順序（5.2節）: URL形式 → API取得 → 公開状態 → チャンネル一致 → ゲームタイトル選択 →
  // （チャンネル詳細流入時のみ）流入元チャンネル一致。この判定を最後に置くのはその順序に合わせるため
  if (typeof sourceChannelId === 'string' && sourceChannelId && sourceChannelId !== channel.youtubeChannelId) {
    return { error: 'channel_mismatch', status: 422 };
  }
  const game = gameDoc.data()!;

  const items = await fetchPlaylistItems(playlist.youtubePlaylistId);
  const durations = await fetchVideoDurations(items.map((i) => i.youtubeVideoId));

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
    gameName: game.title,
    gameGenreIds: game.genreId ? [game.genreId] : [],
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
    playlistTagIds: [],
    playlistTagsFixed: [],
    referenceUrl: playlistUrl,
    lastFetchedAt: null,
  });

  for (const item of items) {
    const videoRef = adminDb.collection('videos').doc(`${playlist.youtubePlaylistId}_${item.youtubeVideoId}`);
    batch.set(videoRef, {
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

  batch.update(gameRef, { playlistCount: (game.playlistCount ?? 0) + 1 });

  await batch.commit();

  return {
    playlistId: playlist.youtubePlaylistId,
    title: playlist.title,
    thumbnailUrl: playlist.thumbnailUrl,
    channelName: channel.name,
    channelIconUrl: channel.iconUrl,
    gameName: game.title,
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
