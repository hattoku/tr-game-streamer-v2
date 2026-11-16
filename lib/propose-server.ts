// 統合した提案ページ（/propose）の再生リスト側で使うサーバー側処理（ページ 提案する 仕様書 §5・§10）。
// 掲載中のチャンネルの再生リストは巡回で全件 `playlists` に取り込み済みなので、URL を使わずにチャンネル → 再生リストの順で選ばせる。
import type { DocumentData } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { normalizeForSearch } from './game-shared';
import { PLAYLIST_PROPOSAL_TYPE } from './proposal-shared';
import { linkPlaylistToGame, unlinkPlaylistGame } from './playlist-game-linking';
import { defaultListingTagIds, listPlaylist } from './listing-server';
import type { ProposeChannel, ProposePlaylist } from './propose-shared';

const PENDING_STATUSES = new Set(['reviewing_lv1', 'reviewing_lv2']);

/** 掲載中のチャンネルの一覧のキャッシュ（数十〜百件程度。インスタンスごとに1分） */
const CHANNEL_CACHE_MS = 60 * 1000;
let channelCache: { at: number; channels: ProposeChannel[] } | null = null;

async function listedChannels(now = Date.now()): Promise<ProposeChannel[]> {
  if (channelCache && now - channelCache.at < CHANNEL_CACHE_MS) return channelCache.channels;
  const [snap, optedOut] = await Promise.all([
    adminDb.collection('exploration_channels').where('status', '==', 'active').get(),
    adminDb.collection('exploration_channels').where('status', '==', 'opted_out').get(),
  ]);
  // 同じ YouTube チャンネルに掲載停止の記録があれば出さない（getProposeChannel と同じ判定）
  const optedOutIds = new Set(optedOut.docs.map((d) => d.data().youtubeChannelId as string));
  const byYoutubeId = new Map<string, ProposeChannel>();
  for (const d of snap.docs) {
    const data = d.data();
    const youtubeChannelId = data.youtubeChannelId as string | undefined;
    if (!youtubeChannelId || byYoutubeId.has(youtubeChannelId) || optedOutIds.has(youtubeChannelId)) continue;
    byYoutubeId.set(youtubeChannelId, {
      youtubeChannelId,
      title: ((data.channelTitle as string | null) || (data.name as string | null) || '').trim(),
      iconUrl: (data.channelIconUrl as string | null) ?? '',
    });
  }
  const channels = [...byYoutubeId.values()].sort((a, b) => a.title.localeCompare(b.title, 'ja'));
  channelCache = { at: now, channels };
  return channels;
}

/** 掲載中のチャンネルを名前の部分一致で探す（§5.1。YouTube の検索は使わない）。最大10件 */
export async function searchProposeChannels(query: string): Promise<ProposeChannel[]> {
  const q = normalizeForSearch(query);
  if (!q) return [];
  const channels = await listedChannels();
  return channels.filter((c) => normalizeForSearch(c.title).includes(q)).slice(0, 10);
}

/** 掲載中のチャンネル1件（`channelId` 付きで来たとき・提案の確認用）。掲載中でなければ null */
export async function getProposeChannel(youtubeChannelId: string): Promise<ProposeChannel | null> {
  // 提案・承認・公開の確認にも使うので、キャッシュを通さず毎回取り直す（掲載を止めた直後でも通さない。仕様書 §10）
  const snap = await adminDb.collection('exploration_channels').where('youtubeChannelId', '==', youtubeChannelId).get();
  const active = snap.docs.find((d) => d.data().status === 'active');
  if (!active || snap.docs.some((d) => d.data().status === 'opted_out')) return null;
  const data = active.data();
  return {
    youtubeChannelId,
    title: ((data.channelTitle as string | null) || (data.name as string | null) || '').trim(),
    iconUrl: (data.channelIconUrl as string | null) ?? '',
  };
}

/** 運営が手で外した再生リストか（§5.2。一般ユーザーの一覧に出さず、提案も受け付けない） */
export function isHiddenByAdmin(data: DocumentData): boolean {
  return (data.listingStatus ?? 'listed') !== 'listed' && data.listingSetBy === 'admin';
}

/** 一覧から提案できる状態か（公開・channel_off でない・掲載中でない・運営が外していない） */
export function canProposeExisting(data: DocumentData): boolean {
  const status = (data.listingStatus as string | undefined) ?? 'listed';
  return data.isPublic === true && status !== 'listed' && status !== 'channel_off' && !isHiddenByAdmin(data);
}

function millis(value: unknown): number {
  return (value as { toMillis?: () => number } | null | undefined)?.toMillis?.() ?? 0;
}

/** 審査中の再生リスト提案（そのチャンネルの分）。youtubePlaylistId → 提案者 */
async function pendingProposalsOfChannel(youtubeChannelId: string): Promise<Map<string, string>> {
  const snap = await adminDb
    .collection('workflows')
    .where('type', '==', PLAYLIST_PROPOSAL_TYPE)
    .where('proposalData.channelId', '==', youtubeChannelId)
    .get();
  const map = new Map<string, string>();
  for (const d of snap.docs) {
    const data = d.data();
    if (!PENDING_STATUSES.has(data.status as string)) continue;
    const id = data.proposalData?.youtubePlaylistId as string | undefined;
    if (id) map.set(id, (data.submittedBy as string) ?? '');
  }
  return map;
}

/**
 * チャンネルの再生リスト一覧（§5.2）。公開中・提案できるもの（未確認・自動判定の対象外）を返す。
 * 非公開・channel_off は返さない。運営が手で外したものは管理者にだけ返す（§9）。
 */
export async function channelPlaylistsForPropose(params: {
  youtubeChannelId: string;
  uid: string;
  isAdmin: boolean;
}): Promise<ProposePlaylist[]> {
  const { youtubeChannelId, uid, isAdmin } = params;
  const [snap, pending] = await Promise.all([
    adminDb.collection('playlists').where('channelId', '==', youtubeChannelId).get(),
    pendingProposalsOfChannel(youtubeChannelId),
  ]);
  const items: (ProposePlaylist & { sortKey: number })[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    const status = (data.listingStatus as string | undefined) ?? 'listed';
    if (data.isPublic !== true || status === 'channel_off') continue;
    const hidden = isHiddenByAdmin(data);
    if (hidden && !isAdmin) continue;
    const pendingBy = pending.get(d.id);
    items.push({
      id: d.id,
      title: (data.title as string) ?? '',
      thumbnailUrl: (data.thumbnailUrl as string) ?? '',
      videoCount: typeof data.videoCount === 'number' ? data.videoCount : 0,
      listingStatus: status,
      listingReason: (data.listingReason as string | null) ?? null,
      hiddenByAdmin: hidden,
      gameId: (data.gameId as string | null) ?? null,
      gameName: (data.gameName as string | null) || null,
      pending: pendingBy !== undefined,
      pendingIsMine: pendingBy === uid,
      sortKey: millis(data.playlistPublishedAt) || millis(data.registeredAt),
    });
  }
  return items.sort((a, b) => b.sortKey - a.sortKey).map(({ sortKey: _sortKey, ...rest }) => rest);
}

/**
 * 掲載前の再生リストのゲームを決めた値にそろえる（承認・管理者の「公開する」用）。`gameId` が null なら今のまま。
 * 掲載前（listed でない）に行うので、ゲームの件数（games.playlistCount）は動かない。
 */
async function setGameBeforeListing(playlistId: string, gameId: string | null, uid: string): Promise<{ ok: true } | { error: string; status: number }> {
  if (!gameId) return { ok: true };
  const snap = await adminDb.collection('playlists').doc(playlistId).get();
  const current = (snap.data()?.gameId as string | null | undefined) ?? null;
  if (current === gameId) return { ok: true };
  if (current) await unlinkPlaylistGame(playlistId, uid);
  const linked = await linkPlaylistToGame(playlistId, gameId, 'admin', uid);
  if (linked === 'linked') return { ok: true };
  return { error: linked, status: linked === 'game_not_found' || linked === 'playlist_not_found' ? 404 : 409 };
}

/**
 * すでに `playlists` にある掲載していない再生リストを掲載する（ページ 提案する 仕様書 §9 の「公開する」、審査ワークフロー仕様書 §15.3 の承認）。
 * チャンネルが掲載中であること、運営が手で外したものは `allowHidden`（管理者の直接操作）のときだけ、を確かめる。
 * まだ動画一覧を取っていなければ YouTube から取る（listPlaylist）。
 */
export async function publishExistingPlaylist(params: {
  playlistId: string;
  gameId: string | null;
  uid: string;
  allowHidden: boolean;
}): Promise<
  | { playlistId: string; title: string; thumbnailUrl: string; channelName: string; channelIconUrl: string; gameName: string; videoCount: number }
  | { error: string; status: number }
> {
  const { playlistId, gameId, uid, allowHidden } = params;
  const ref = adminDb.collection('playlists').doc(playlistId);
  const snap = await ref.get();
  if (!snap.exists) return { error: 'playlist_not_found', status: 404 };
  const data = snap.data()!;
  if ((data.listingStatus ?? 'listed') === 'listed') return { error: 'already_registered', status: 409 };
  if (data.listingStatus === 'channel_off') return { error: 'channel_not_listed', status: 409 };
  if (!allowHidden && isHiddenByAdmin(data)) return { error: 'hidden_by_admin', status: 409 };
  if (data.isPublic !== true) return { error: 'not_public', status: 422 };
  if (!(await getProposeChannel((data.channelId as string) ?? ''))) return { error: 'channel_not_listed', status: 409 };

  const game = await setGameBeforeListing(playlistId, gameId, uid);
  if ('error' in game) return game;
  // 掲載するときの既定のタグ（チャンネル単位タグ＋タイトル由来のタグ）も、巡回で掲載するときと同じように付ける
  const tagIds = await defaultListingTagIds(data, { channelTags: new Map() });
  const listed = await listPlaylist(playlistId, { setBy: 'admin', reason: 'admin', tagIds });
  if (!listed.ok) {
    const status = listed.error === 'not_found' || listed.error === 'playlist_not_found' ? 404 : listed.error === 'youtube_api_error' ? 502 : 409;
    return { error: listed.error, status };
  }
  const after = (await ref.get()).data()!;
  return {
    playlistId,
    title: (after.title as string) ?? '',
    thumbnailUrl: (after.thumbnailUrl as string) ?? '',
    channelName: (after.channelName as string) ?? '',
    channelIconUrl: (after.channelIconUrl as string) ?? '',
    gameName: (after.gameName as string) ?? '',
    videoCount: typeof after.videoCount === 'number' ? after.videoCount : 0,
  };
}
