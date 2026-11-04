// 再生リストの掲載状態を切り替える処理（サーバー専用）。
// 管理_Ai運営者 コンテンツ収集機能仕様書 §10.4・§10.6・§10.11、収集候補レビューUI仕様書 §8.3・§9.3・§9.5。
// 掲載中（listed）だけを件数（games.playlistCount・channels.playlistCount・tags.usagePlaylistCount）に数えるので、
// listed に入る・出るときは件数も一緒に直す。状態と件数は1件ずつトランザクションで変え、同時に操作しても二重に数えない。
import { FieldValue, type DocumentData, type Transaction } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { matchTitleTagNames } from './exploration-rules';
import { fetchOperatorTagIdsByName } from './operator-tags';
import { fetchAndStoreAllVideos } from './playlist-videos';
import { YouTubeApiError } from './youtube';
import type { ListingStatus } from './listing';

/** 管理者が確認画面で選べる行き先 */
export const ADMIN_LISTING_TARGETS = ['listed', 'non_game', 'excluded'] as const;
export type AdminListingTarget = (typeof ADMIN_LISTING_TARGETS)[number];

export type ListingChangeError =
  | 'not_found'
  | 'channel_off'
  | 'not_public'
  | 'playlist_not_found'
  | 'quota_exceeded'
  | 'youtube_api_error';

export type ListingChangeResult = { ok: true; changed: boolean; fetchedVideos: boolean } | { ok: false; error: ListingChangeError };

/** 件数を増やす・減らす（listed に入る・出るとき）。読み取りは呼び出し側で済ませておく（トランザクションは読み取りが先） */
function applyCountDelta(
  tx: Transaction,
  data: DocumentData,
  tagIds: string[],
  delta: 1 | -1,
  channelSnap: FirebaseFirestore.DocumentSnapshot | null,
) {
  const gameId = data.gameId as string | null | undefined;
  if (gameId) tx.update(adminDb.collection('games').doc(gameId), { playlistCount: FieldValue.increment(delta) });
  for (const tagId of tagIds) {
    tx.update(adminDb.collection('tags').doc(tagId), { usagePlaylistCount: FieldValue.increment(delta) });
  }
  const channelId = data.channelId as string | undefined;
  if (!channelId || !channelSnap) return;
  if (channelSnap.exists) {
    tx.update(channelSnap.ref, { playlistCount: FieldValue.increment(delta) });
  } else if (delta === 1) {
    // 巡回で取り込んだチャンネルは、初めて掲載するときに channels のドキュメントを作る（登録と同じ形。lib/playlist-registration.ts）
    tx.set(channelSnap.ref, {
      youtubeChannelId: channelId,
      name: (data.channelName as string) ?? '',
      iconUrl: (data.channelIconUrl as string) ?? '',
      description: null,
      isAiGeneratedDescription: false,
      subscriberCount: null,
      playlistCount: 1,
      registeredAt: new Date(),
      lastFetchedAt: null,
    });
  }
}

/** タグのうち、存在するものだけ（消されたタグの usagePlaylistCount を update するとトランザクションごと失敗するため） */
async function existingTagIds(tagIds: string[]): Promise<string[]> {
  if (tagIds.length === 0) return [];
  const snaps = await adminDb.getAll(...tagIds.map((id) => adminDb.collection('tags').doc(id)));
  return snaps.filter((s) => s.exists).map((s) => s.id);
}

/** 掲載するときに付けるタグの既定（チャンネル単位タグ＋タイトル由来のタグ。運営者タグのみ。§3.5） */
export async function defaultListingTagIds(
  data: DocumentData,
  cache: { operatorTags?: Map<string, string>; channelTags: Map<string, string[]> },
): Promise<string[]> {
  cache.operatorTags ??= await fetchOperatorTagIdsByName();
  const explorationChannelId = data.explorationChannelId as string | null | undefined;
  let channelTags: string[] = [];
  if (explorationChannelId) {
    if (!cache.channelTags.has(explorationChannelId)) {
      const snap = await adminDb.collection('exploration_channels').doc(explorationChannelId).get();
      cache.channelTags.set(explorationChannelId, (snap.data()?.tagIds as string[] | undefined) ?? []);
    }
    channelTags = cache.channelTags.get(explorationChannelId)!;
  }
  const titleTags = matchTitleTagNames((data.title as string) ?? '')
    .map((name) => cache.operatorTags!.get(name))
    .filter((id): id is string => !!id);
  const operatorIds = new Set(cache.operatorTags.values());
  return [...new Set([...channelTags, ...titleTags])].filter((id) => operatorIds.has(id));
}

/**
 * 再生リストを掲載する（listed にする）。動画一覧をまだ取っていなければ YouTube から取る（クォータを使う）。
 * `tagIds` は固定タグとして足すタグ（運営者タグであることは呼び出し側で確かめる）。
 */
export async function listPlaylist(
  playlistId: string,
  params: { setBy: 'admin' | 'auto'; reason: string; tagIds: string[] },
): Promise<ListingChangeResult> {
  const ref = adminDb.collection('playlists').doc(playlistId);
  const before = await ref.get();
  if (!before.exists) return { ok: false, error: 'not_found' };
  const data = before.data()!;
  if (data.listingStatus === 'channel_off') return { ok: false, error: 'channel_off' };
  if (data.isPublic !== true) return { ok: false, error: 'not_public' };
  if (data.listingStatus === 'listed') return { ok: true, changed: false, fetchedVideos: false };

  // 動画一覧（youtubeItemCount が null ＝ まだ取っていない。§10.11）
  let fetched: Awaited<ReturnType<typeof fetchAndStoreAllVideos>> | null = null;
  if (data.youtubeItemCount == null) {
    try {
      fetched = await fetchAndStoreAllVideos(playlistId);
    } catch (e) {
      if (e instanceof YouTubeApiError) {
        if (e.status === 404 || e.reason === 'playlistNotFound') return { ok: false, error: 'playlist_not_found' };
        if (e.reason === 'quotaExceeded' || e.reason === 'dailyLimitExceeded') return { ok: false, error: 'quota_exceeded' };
        return { ok: false, error: 'youtube_api_error' };
      }
      throw e;
    }
  }
  const requestedTags = await existingTagIds([...new Set(params.tagIds)]);
  const now = new Date();

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, error: 'not_found' } as const;
    const current = snap.data()!;
    if (current.listingStatus === 'channel_off') return { ok: false, error: 'channel_off' } as const;
    if (current.listingStatus === 'listed') return { ok: true, changed: false, fetchedVideos: fetched !== null } as const;
    const channelSnap = current.channelId ? await tx.get(adminDb.collection('channels').doc(current.channelId as string)) : null;

    const playlistTagIds = [...new Set([...((current.playlistTagIds as string[] | undefined) ?? []), ...requestedTags])];
    const playlistTagsFixed = [...new Set([...((current.playlistTagsFixed as string[] | undefined) ?? []), ...requestedTags])];
    const update: Record<string, unknown> = {
      listingStatus: 'listed',
      listingReason: params.reason,
      listingSetBy: params.setBy,
      listingSetAt: now,
      previousListingStatus: null,
      playlistTagIds,
      playlistTagsFixed,
    };
    if (fetched) {
      Object.assign(update, {
        videoCount: fetched.items.length,
        // 巡回で見た YouTube の動画数（無ければ取れた本数）。次の新着の確認で違えば取り直す（YouTube定期取得仕様書 §7.2）
        youtubeItemCount: typeof current.videoCount === 'number' ? current.videoCount : fetched.items.length,
        latestVideoPublishedAt: fetched.latestPublishedAt,
        lastFetchedAt: now,
        fullRefetchedAt: now,
      });
    }
    tx.update(ref, update);
    applyCountDelta(tx, current, playlistTagIds, 1, channelSnap);
    return { ok: true, changed: true, fetchedVideos: fetched !== null } as const;
  });
}

/**
 * 掲載中でない状態にする（ゲームではない・対象外・確認待ちなど）。掲載中だったら件数を戻す。
 * 動画・タグ・レビュー・マイリストは消さない（§10.7）。`channel_off` はこの関数では扱わない（チャンネルの操作で変える）。
 */
export async function unlistPlaylist(
  playlistId: string,
  target: Exclude<ListingStatus, 'listed' | 'channel_off'>,
  params: { setBy: 'admin' | 'auto'; reason: string },
): Promise<ListingChangeResult> {
  const ref = adminDb.collection('playlists').doc(playlistId);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, error: 'not_found' } as const;
    const current = snap.data()!;
    if (current.listingStatus === 'channel_off') return { ok: false, error: 'channel_off' } as const;
    const wasListed = current.listingStatus === 'listed';
    const channelSnap = wasListed && current.channelId ? await tx.get(adminDb.collection('channels').doc(current.channelId as string)) : null;
    if (current.listingStatus === target && current.listingSetBy === params.setBy && current.listingReason === params.reason) return { ok: true, changed: false, fetchedVideos: false } as const;
    tx.update(ref, { listingStatus: target, listingReason: params.reason, listingSetBy: params.setBy, listingSetAt: new Date(), previousListingStatus: null });
    if (wasListed) applyCountDelta(tx, current, (current.playlistTagIds as string[] | undefined) ?? [], -1, channelSnap);
    return { ok: true, changed: true, fetchedVideos: false } as const;
  });
}

// ---- チャンネル単位の操作（§10.6、収集候補レビューUI仕様書 §9.3・§9.5） ----

/** チャンネルの再生リスト（explorationChannelId が一致する、または YouTube のチャンネルが同じもの） */
export async function playlistsOfChannel(explorationChannelId: string, youtubeChannelId: string | null) {
  const [byExploration, byChannel] = await Promise.all([
    adminDb.collection('playlists').where('explorationChannelId', '==', explorationChannelId).get(),
    youtubeChannelId ? adminDb.collection('playlists').where('channelId', '==', youtubeChannelId).get() : Promise.resolve(null),
  ]);
  const docs = new Map(byExploration.docs.map((d) => [d.id, d]));
  byChannel?.docs.forEach((d) => docs.set(d.id, d));
  return [...docs.values()];
}

/** チャンネルの再生リストをすべて非表示（channel_off）にする。戻せるよう元の状態・理由・決めた者を残す */
export async function turnChannelOff(explorationChannelId: string, youtubeChannelId: string | null, reason: 'channel_excluded' | 'opt_out'): Promise<number> {
  let changed = 0;
  for (const doc of await playlistsOfChannel(explorationChannelId, youtubeChannelId)) {
    const done = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      if (!snap.exists) return false;
      const current = snap.data()!;
      if (current.listingStatus === 'channel_off') {
        // 掲載から外したあとに止めた: 理由だけ opt_out に変える（元の状態はそのまま。§9.5）
        if (reason === 'opt_out' && current.listingReason !== 'opt_out') {
          tx.update(doc.ref, { listingReason: 'opt_out', listingSetAt: new Date() });
          return true;
        }
        return false;
      }
      const wasListed = current.listingStatus === 'listed';
      const channelSnap = wasListed && current.channelId ? await tx.get(adminDb.collection('channels').doc(current.channelId as string)) : null;
      tx.update(doc.ref, {
        listingStatus: 'channel_off',
        listingReason: reason,
        listingSetBy: 'admin',
        listingSetAt: new Date(),
        previousListingStatus: current.listingStatus ?? 'listed',
        previousListingReason: current.listingReason ?? null,
        previousListingSetBy: current.listingSetBy ?? 'admin',
      });
      if (wasListed) applyCountDelta(tx, current, (current.playlistTagIds as string[] | undefined) ?? [], -1, channelSnap);
      return true;
    });
    if (done) changed++;
  }
  return changed;
}

/**
 * channel_off の再生リストを元の掲載状態に戻す。戻す先が listed で動画一覧が無いもの（30日の消し込みで動画を消した等）は、
 * 動画を取らずに確認待ち（confirm）に戻す（§9.5）。
 */
export async function restoreChannelPlaylists(explorationChannelId: string, youtubeChannelId: string | null): Promise<{ restored: number; listed: number }> {
  let restored = 0;
  let listed = 0;
  for (const doc of await playlistsOfChannel(explorationChannelId, youtubeChannelId)) {
    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      if (!snap.exists) return null;
      const current = snap.data()!;
      if (current.listingStatus !== 'channel_off') return null;
      let target = (current.previousListingStatus as ListingStatus | null) ?? 'unconfirmed';
      let reason = (current.previousListingReason as string | null) ?? (target === 'unconfirmed' ? 'confirm' : 'admin');
      let setBy = (current.previousListingSetBy as string | null) ?? 'admin';
      if (target === 'channel_off') target = 'unconfirmed';
      if (target === 'listed' && current.youtubeItemCount == null) {
        target = 'unconfirmed';
        reason = 'confirm';
        setBy = 'auto';
      }
      const channelSnap = target === 'listed' && current.channelId ? await tx.get(adminDb.collection('channels').doc(current.channelId as string)) : null;
      tx.update(doc.ref, {
        listingStatus: target,
        listingReason: reason,
        listingSetBy: setBy,
        listingSetAt: new Date(),
        previousListingStatus: null,
        previousListingReason: null,
        previousListingSetBy: null,
      });
      if (target === 'listed') applyCountDelta(tx, current, (current.playlistTagIds as string[] | undefined) ?? [], 1, channelSnap);
      return target;
    });
    if (result) restored++;
    if (result === 'listed') listed++;
  }
  return { restored, listed };
}
