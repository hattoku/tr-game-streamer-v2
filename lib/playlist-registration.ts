// 再生リストの本登録処理（サーバー専用）。管理者用の登録API（app/api/playlists/register）と、
// コンテンツ収集の承認（app/api/admin/collection/candidates、収集候補レビューUI仕様書 v2.0 §4）で共用する。
// プレビュー時・候補保存時の情報をそのまま信用せず、YouTube APIとFirestoreの状態をサーバー側で取り直してから書き込む。
// AI説明文自動生成（ページ 再生リストを追加する 仕様書 4.1.4節）はスコープ外のため、新規チャンネルの説明文は
// 管理者の手入力（channelDescription、任意）をそのまま保存する。
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import {
  fetchChannelSnippet,
  fetchPlaylistItems,
  fetchPlaylistSnippet,
  fetchVideoDurations,
  YouTubeApiError,
} from './youtube';

export type RegisterPlaylistError =
  | 'youtube_api_error'
  | 'playlist_not_found'
  | 'not_public'
  | 'channel_not_found'
  | 'already_registered'
  | 'game_not_found'
  | 'channel_mismatch';

export interface RegisterPlaylistParams {
  playlistId: string;
  gameId: string;
  registeredBy: string;
  /** playlists.referenceUrl に保存する元URL */
  referenceUrl: string;
  /** 新規チャンネルの説明文（管理者の手入力、任意） */
  channelDescription?: string | null;
  /** チャンネル詳細ページから流入した場合の流入元チャンネルID（一致しなければ登録しない） */
  sourceChannelId?: string | null;
  /** 固定タグとして付けるタグID（運営者タグ。存在確認は呼び出し側で行う） */
  fixedTagIds?: string[];
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

export type RegisterPlaylistResult =
  | { ok: true; playlist: RegisteredPlaylist }
  | { ok: false; error: RegisterPlaylistError; message?: string };

export async function registerPlaylist(params: RegisterPlaylistParams): Promise<RegisterPlaylistResult> {
  const { playlistId, gameId, registeredBy, referenceUrl, channelDescription, sourceChannelId } = params;
  const fixedTagIds = [...new Set(params.fixedTagIds ?? [])];

  let playlist;
  try {
    playlist = await fetchPlaylistSnippet(playlistId);
  } catch (e) {
    return { ok: false, error: 'youtube_api_error', message: e instanceof YouTubeApiError ? e.message : undefined };
  }
  if (!playlist) return { ok: false, error: 'playlist_not_found' };
  if (!playlist.isPublic) return { ok: false, error: 'not_public' };

  const channel = await fetchChannelSnippet(playlist.channelId);
  if (!channel) return { ok: false, error: 'channel_not_found' };

  const playlistRef = adminDb.collection('playlists').doc(playlist.youtubePlaylistId);
  const channelRef = adminDb.collection('channels').doc(channel.youtubeChannelId);
  const gameRef = adminDb.collection('games').doc(gameId);

  const [playlistDoc, channelDoc, gameDoc] = await Promise.all([playlistRef.get(), channelRef.get(), gameRef.get()]);

  if (playlistDoc.exists) return { ok: false, error: 'already_registered' };
  if (!gameDoc.exists) return { ok: false, error: 'game_not_found' };
  // チェック順序（ページ 再生リストを追加する 仕様書 5.2節）: URL形式 → API取得 → 公開状態 → チャンネル一致 →
  // ゲームタイトル選択 →（チャンネル詳細流入時のみ）流入元チャンネル一致。この判定を最後に置くのはその順序に合わせるため
  if (sourceChannelId && sourceChannelId !== channel.youtubeChannelId) {
    return { ok: false, error: 'channel_mismatch' };
  }
  const game = gameDoc.data()!;

  const items = await fetchPlaylistItems(playlistId);
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
      description: channelDescription?.trim() ? channelDescription.trim() : null,
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
    isPublic: true,
    score: null,
    reviewCount: 0,
    mylistCount: 0,
    playlistTagIds: fixedTagIds,
    playlistTagsFixed: fixedTagIds,
    referenceUrl,
    lastFetchedAt: null,
  });

  for (const tagId of fixedTagIds) {
    batch.update(adminDb.collection('tags').doc(tagId), { usagePlaylistCount: FieldValue.increment(1) });
  }

  batch.update(gameRef, { playlistCount: (game.playlistCount ?? 0) + 1 });

  await batch.commit();

  return {
    ok: true,
    playlist: {
      playlistId: playlist.youtubePlaylistId,
      title: playlist.title,
      thumbnailUrl: playlist.thumbnailUrl,
      channelName: channel.name,
      channelIconUrl: channel.iconUrl,
      gameName: game.title,
      videoCount: items.length,
    },
  };
}
