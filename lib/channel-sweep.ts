// 掲載チャンネルの巡回（サーバー専用）。管理_Ai運営者 コンテンツ収集機能仕様書 §10.3・§10.4・§10.11、
// 共通 YouTube定期取得仕様書 §8.1・§8.6。
// チャンネルの全再生リストを playlists.list?channelId（50件ごとに1ユニット）で取り、プレミテに無いものは
// メタ情報だけで playlists に作って掲載状態を判定する（全件保存。除外・非ゲーム・10本未満も消さずに持つ）。
// 動画一覧は掲載（listed）にするときに初めて取る。「自動で掲載」のチャンネルでルールに当たらなかったものは
// いったん unconfirmed（auto_pending）で作り、listAutoPending で動画一覧を取ってから listed にする。
//
// 巡回の入口はどれもこのファイルの sweepChannels → listAutoPending を通る:
//   - 毎日の「新着動画の再取得」（lib/new-videos-refresh.ts の refreshNewVideos。全チャンネル）
//   - 手動の巡回（lib/channel-sweep-run.ts の runChannelSweep）: 確認画面の「巡回を実行」・掲載チャンネル画面の「このチャンネルだけ巡回」
//   - 掲載チャンネルに加えた直後（lib/channel-sweep-run.ts の sweepChannelNow）: 掲載チャンネル画面で登録済みにしたとき・チャンネル申請の承認
import type { DocumentData, DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { extractGameQuery } from './playlist-title-rules';
import { judgeListing, parseListingRules, publishModeOf, type ListingRules, type PublishMode } from './listing-rules';
import { matchGameForPlaylist } from './playlist-game-linking';
import { defaultListingTagIds, listPlaylist } from './listing-server';
import { estimateVideoFetchCost } from './playlist-videos';
import { fetchChannelPlaylists, fetchChannelSnippet, getQuotaConsumed, YouTubeApiError, type ChannelPlaylist, type PlaylistItemCount } from './youtube';

const WRITE_CHUNK_SIZE = 400;
const DAY_MS = 24 * 60 * 60 * 1000;
/** メタ情報が変わっていなくても metaFetchedAt を書き直す間隔（毎日書くと書き込みが件数分増えるため。30日より十分短く） */
const META_TOUCH_INTERVAL_MS = 7 * DAY_MS;

export async function loadListingRules(): Promise<ListingRules> {
  const snap = await adminDb.collection('app_settings').doc('listing_rules').get();
  return parseListingRules(snap.data());
}

export interface GameForSweep {
  id: string;
  title: string;
  aliases: string[];
  genreId: string | null;
}

export async function loadGamesForSweep(): Promise<GameForSweep[]> {
  const snap = await adminDb.collection('games').get();
  return snap.docs.map((d) => ({
    id: d.id,
    title: (d.data().title as string) ?? '',
    aliases: (d.data().aliases as string[] | undefined) ?? [],
    genreId: (d.data().genreId as string | null | undefined) ?? null,
  }));
}

export interface SweepContext {
  rules: ListingRules;
  games: GameForSweep[];
  now: Date;
}

/** 巡回に使う判定の言葉の表とゲームタイトルを読む */
export async function loadSweepContext(now: Date): Promise<SweepContext> {
  const [rules, games] = await Promise.all([loadListingRules(), loadGamesForSweep()]);
  return { rules, games, now };
}

export type NewPlaylistCounts = Record<'unconfirmed' | 'non_game' | 'excluded' | 'too_short', number>;

export interface ChannelSweepResult {
  explorationChannelId: string;
  playlistsFetched: number;
  newCounts: NewPlaylistCounts;
  /** 判定し直した（too_short が最小本数に達した）数 */
  rejudged: number;
  /** 巡回で得た動画数（新着の監視で id 指定の確認を省くために使う） */
  itemCounts: Map<string, PlaylistItemCount>;
  /** プレミテにあるがチャンネルの一覧に無かった再生リスト（チャンネルから消えた・非公開になった） */
  missing: Array<{ playlistId: string; title: string }>;
}

export function emptyNewCounts(): NewPlaylistCounts {
  return { unconfirmed: 0, non_game: 0, excluded: 0, too_short: 0 };
}

/** 判定の結果を、巡回で書く掲載状態にする（listed は動画一覧を取るまで unconfirmed＋auto_pending。§10.11） */
function toStoredJudgement(title: string, itemCount: number, ctx: SweepContext, mode: PublishMode) {
  const judged = judgeListing({ title, itemCount }, ctx.rules, mode);
  return judged.status === 'listed' ? { status: 'unconfirmed' as const, reason: 'auto_pending' } : judged;
}

function guessGameFor(title: string, ctx: SweepContext): { game: GameForSweep | null; hint: string | null } {
  const hint = extractGameQuery(title);
  const byTitle = matchGameForPlaylist({ title, gameHint: null }, ctx.games);
  const game = (byTitle ?? matchGameForPlaylist({ title, gameHint: hint }, ctx.games)) as GameForSweep | null;
  return { game, hint: game ? null : hint || null };
}

function newPlaylistDoc(p: ChannelPlaylist, channel: DocumentData, explorationChannelId: string, ctx: SweepContext, judged: { status: string; reason: string; setBy: 'auto' | 'admin' }) {
  const { game, hint } = guessGameFor(p.title, ctx);
  return {
    youtubePlaylistId: p.youtubePlaylistId,
    title: p.title,
    thumbnailUrl: p.thumbnailUrl,
    channelId: p.channelId,
    channelName: (channel.channelTitle as string) || p.channelTitle,
    channelIconUrl: (channel.channelIconUrl as string) ?? '',
    gameId: game?.id ?? null,
    gameName: game?.title ?? '',
    gameGenreIds: game?.genreId ? [game.genreId] : [],
    gameHint: hint,
    gameSetBy: game ? 'auto' : null,
    gameSetAt: game ? ctx.now : null,
    // 動画一覧を取るまでは YouTube の動画数（巡回のたびに更新）。youtubeItemCount が null ＝ 動画一覧が未取得（§10.11）
    videoCount: p.itemCount,
    youtubeItemCount: null,
    latestVideoPublishedAt: null,
    registeredAt: ctx.now,
    registeredBy: 'system',
    proposedBy: null,
    isPublic: p.isPublic,
    listingStatus: judged.status,
    listingReason: judged.reason,
    listingSetBy: judged.setBy,
    listingSetAt: ctx.now,
    previousListingStatus: null,
    source: 'channel_sweep',
    explorationChannelId,
    score: null,
    reviewCount: 0,
    mylistCount: 0,
    playlistTagIds: [],
    playlistTagsFixed: [],
    referenceUrl: `https://www.youtube.com/playlist?list=${p.youtubePlaylistId}`,
    lastFetchedAt: null,
    fullRefetchedAt: null,
    metaFetchedAt: ctx.now,
    playlistPublishedAt: p.publishedAt ? new Date(p.publishedAt) : null,
  };
}

function millis(value: unknown): number | null {
  return (value as { toMillis?: () => number } | null | undefined)?.toMillis?.() ?? null;
}

/**
 * 掲載チャンネルのアイコン。段階3の移行で作った掲載チャンネルはアイコンが空（null）だったため、
 * 空ならプレミテのチャンネルページ（channels.iconUrl）、それも無ければ YouTube（channels.list、1ユニット）から補う（2026-11-12）。
 * 取れなかったら空のまま（巡回は止めない）。
 */
async function resolveChannelIconUrl(channel: DocumentData, channelPage: DocumentSnapshot): Promise<string> {
  const current = (channel.channelIconUrl as string | null | undefined) ?? '';
  if (current) return current;
  const fromPage = (channelPage.data()?.iconUrl as string | undefined) ?? '';
  if (fromPage) return fromPage;
  try {
    return (await fetchChannelSnippet(channel.youtubeChannelId as string))?.iconUrl ?? '';
  } catch (e) {
    if (isQuotaExceededError(e)) throw e;
    return '';
  }
}

/** 1つの掲載チャンネル（active）を巡回する。YouTube のエラーは呼び出し元へ投げる */
export async function sweepChannel(channelDoc: DocumentSnapshot, ctx: SweepContext): Promise<ChannelSweepResult> {
  const stored = channelDoc.data()!;
  const youtubeChannelId = stored.youtubeChannelId as string;
  const mode = publishModeOf(stored);
  const fetched = await fetchChannelPlaylists(youtubeChannelId);
  const channelPage = await adminDb.collection('channels').doc(youtubeChannelId).get();
  const iconUrl = await resolveChannelIconUrl(stored, channelPage);
  // 取り込む再生リストには補ったアイコンを入れる（newPlaylistDoc は channel.channelIconUrl を使う）
  const channel = iconUrl && iconUrl !== stored.channelIconUrl ? { ...stored, channelIconUrl: iconUrl } : stored;

  const existingSnap = await adminDb.collection('playlists').where('channelId', '==', youtubeChannelId).get();
  const existing = new Map(existingSnap.docs.map((d) => [d.id, d]));

  const result: ChannelSweepResult = {
    explorationChannelId: channelDoc.id,
    playlistsFetched: fetched.length,
    newCounts: emptyNewCounts(),
    rejudged: 0,
    itemCounts: new Map(),
    missing: [],
  };

  const writes: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
  const fetchedIds = new Set<string>();
  for (const p of fetched) {
    fetchedIds.add(p.youtubePlaylistId);
    result.itemCounts.set(p.youtubePlaylistId, { itemCount: p.itemCount, isPublic: p.isPublic, title: p.title, thumbnailUrl: p.thumbnailUrl });
    const ref = adminDb.collection('playlists').doc(p.youtubePlaylistId);
    const doc = existing.get(p.youtubePlaylistId);

    if (!doc) {
      const judged = { ...toStoredJudgement(p.title, p.itemCount, ctx, mode), setBy: 'auto' as const };
      writes.push((b) => b.set(ref, newPlaylistDoc(p, channel, channelDoc.id, ctx, judged)));
      result.newCounts[judged.status as keyof NewPlaylistCounts]++;
      continue;
    }

    const data = doc.data();
    const update: Record<string, unknown> = {};
    if (p.title && p.title !== data.title) update.title = p.title;
    if (p.thumbnailUrl && p.thumbnailUrl !== data.thumbnailUrl) update.thumbnailUrl = p.thumbnailUrl;
    // 動画一覧を取っていない再生リストは、表示する本数を YouTube に合わせる
    if (data.youtubeItemCount == null && data.videoCount !== p.itemCount) update.videoCount = p.itemCount;
    if (!data.explorationChannelId) update.explorationChannelId = channelDoc.id;
    // アイコンが空のまま取り込まれた再生リストを補う
    if (iconUrl && !data.channelIconUrl) update.channelIconUrl = iconUrl;

    // 10本未満が最小本数に達した（自動で決めたものだけ。§10.4 例外(a)）
    if (data.listingStatus === 'too_short' && data.listingSetBy === 'auto' && p.itemCount >= ctx.rules.minVideoCount) {
      const judged = toStoredJudgement(p.title, p.itemCount, ctx, mode);
      if (judged.status !== 'too_short') {
        Object.assign(update, { listingStatus: judged.status, listingReason: judged.reason, listingSetAt: ctx.now });
        result.rejudged++;
      }
    }
    // 掲載方法を「確認」に戻したチャンネルの「自動で掲載する予定」は、確認待ちに変える（§10.11）
    if (data.listingReason === 'auto_pending' && mode !== 'auto' && update.listingReason === undefined) {
      Object.assign(update, { listingReason: 'confirm', listingSetAt: ctx.now });
    }

    const metaAt = millis(data.metaFetchedAt);
    if (Object.keys(update).length > 0 || metaAt === null || ctx.now.getTime() - metaAt > META_TOUCH_INTERVAL_MS) {
      update.metaFetchedAt = ctx.now;
      writes.push((b) => b.update(ref, update));
    }
  }

  for (const doc of existingSnap.docs) {
    const data = doc.data();
    if (!fetchedIds.has(doc.id) && data.isPublic === true && data.listingStatus !== 'channel_off') {
      result.missing.push({ playlistId: doc.id, title: (data.title as string) ?? doc.id });
    }
  }

  if (iconUrl && channelPage.exists && !channelPage.data()?.iconUrl) writes.push((b) => b.update(channelPage.ref, { iconUrl }));

  for (let i = 0; i < writes.length; i += WRITE_CHUNK_SIZE) {
    const batch = adminDb.batch();
    writes.slice(i, i + WRITE_CHUNK_SIZE).forEach((w) => w(batch));
    await batch.commit();
  }

  const newCount = totalNewPlaylists(result.newCounts);
  await channelDoc.ref.update({
    lastSweptAt: ctx.now,
    lastSweepNewCount: newCount,
    // 段階3までの画面・申請の処理との互換
    lastExploredAt: ctx.now,
    lastFoundCount: newCount,
    // 登録者数は統計値なので30日を超えて持たない（YouTube API 規約 III.E.4.b。確定のときの確認にだけ使う）
    subscriberCount: null,
    ...(iconUrl && iconUrl !== stored.channelIconUrl ? { channelIconUrl: iconUrl } : {}),
    updatedAt: ctx.now,
  });
  return result;
}

export interface SweepChannelsResult {
  /** 巡回できた掲載チャンネルのドキュメントID */
  swept: Set<string>;
  playlistsFetched: number;
  newCounts: NewPlaylistCounts;
  itemCounts: Map<string, PlaylistItemCount>;
  missing: Array<{ playlistId: string; title: string }>;
  /** YouTube のエラーで巡回できなかったチャンネル */
  errors: Array<{ explorationChannelId: string; message: string }>;
  /** YouTube の1日のクォータが途中で尽きた */
  quotaExceeded: boolean;
  /** 枠が足りない（canSweep が false・クォータが尽きた）ので巡回しなかったチャンネル */
  skipped: string[];
}

export function emptySweepChannelsResult(): SweepChannelsResult {
  return { swept: new Set(), playlistsFetched: 0, newCounts: emptyNewCounts(), itemCounts: new Map(), missing: [], errors: [], quotaExceeded: false, skipped: [] };
}

/**
 * 掲載チャンネルを順に巡回する（巡回の入口で共通）。各チャンネルの前に canSweep() を確かめ、false なら残りは skipped にする。
 * YouTube のエラーはチャンネルごとに errors に残して続ける（クォータが尽きたら残りは skipped）。それ以外のエラーは投げる。
 * 途中で投げても、そこまでの結果は result（呼び出し側が渡したもの）に残る。
 */
export async function sweepChannels(
  channels: readonly DocumentSnapshot[],
  ctx: SweepContext,
  options: { canSweep: () => boolean },
  result: SweepChannelsResult = emptySweepChannelsResult(),
): Promise<SweepChannelsResult> {
  for (const channelDoc of channels) {
    if (result.quotaExceeded || !options.canSweep()) {
      result.skipped.push(channelDoc.id);
      continue;
    }
    try {
      const swept = await sweepChannel(channelDoc, ctx);
      result.swept.add(channelDoc.id);
      result.playlistsFetched += swept.playlistsFetched;
      for (const [k, v] of Object.entries(swept.newCounts)) result.newCounts[k as keyof NewPlaylistCounts] += v;
      swept.itemCounts.forEach((v, k) => result.itemCounts.set(k, v));
      result.missing.push(...swept.missing);
    } catch (e) {
      if (!(e instanceof YouTubeApiError)) throw e;
      result.errors.push({ explorationChannelId: channelDoc.id, message: e.message });
      if (isQuotaExceededError(e)) result.quotaExceeded = true;
    }
  }
  return result;
}

export function totalNewPlaylists(counts: NewPlaylistCounts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

export interface AutoListSummary {
  listed: number;
  deferred: number;
  errors: Array<{ playlistId: string; title: string; message: string }>;
}

/**
 * 「自動で掲載する予定」（auto_pending）の再生リストの動画一覧を取り、listed にする（作成日時の古い順）。
 * `canSpend(見込みユニット)` が false を返したら残りは翌日に回す。explorationChannelIds を渡すとそのチャンネルの分だけ。
 */
export async function listAutoPending(options: { canSpend: (units: number) => boolean; explorationChannelIds?: Set<string> }): Promise<AutoListSummary> {
  const summary: AutoListSummary = { listed: 0, deferred: 0, errors: [] };
  const snap = await adminDb.collection('playlists').where('listingReason', '==', 'auto_pending').get();
  const docs = snap.docs
    .filter((d) => d.data().listingStatus === 'unconfirmed')
    .filter((d) => !options.explorationChannelIds || options.explorationChannelIds.has(d.data().explorationChannelId as string))
    .sort((a, b) => (millis(a.data().playlistPublishedAt) ?? 0) - (millis(b.data().playlistPublishedAt) ?? 0));

  const modes = new Map<string, PublishMode>();
  const tagCache = { channelTags: new Map<string, string[]>() } as Parameters<typeof defaultListingTagIds>[1];
  for (const doc of docs) {
    const data = doc.data();
    const channelId = data.explorationChannelId as string | null;
    if (channelId && !modes.has(channelId)) {
      const ch = await adminDb.collection('exploration_channels').doc(channelId).get();
      modes.set(channelId, ch.exists && ch.data()!.status === 'active' ? publishModeOf(ch.data()) : 'confirm');
    }
    if (!channelId || modes.get(channelId) !== 'auto') {
      // 掲載方法が「確認」に戻ったチャンネル（または掲載チャンネルでなくなった）は確認待ちにする
      await doc.ref.update({ listingReason: 'confirm', listingSetAt: new Date() });
      continue;
    }
    if (!options.canSpend(estimateVideoFetchCost((data.videoCount as number) ?? 0))) {
      summary.deferred++;
      continue;
    }
    const tagIds = await defaultListingTagIds(data, tagCache);
    const result = await listPlaylist(doc.id, { setBy: 'auto', reason: 'auto', tagIds });
    if (result.ok) {
      if (result.changed) summary.listed++;
    } else if (result.error === 'quota_exceeded') {
      summary.deferred++;
      break;
    } else {
      summary.errors.push({ playlistId: doc.id, title: (data.title as string) ?? doc.id, message: result.error });
    }
  }
  return summary;
}

/** 巡回の対象（status: active で YouTube のチャンネルが決まっているもの）を、最終巡回の古い順に */
export async function activeChannelsForSweep(explorationChannelId?: string): Promise<QueryDocumentSnapshot[] | DocumentSnapshot[]> {
  if (explorationChannelId) {
    const doc = await adminDb.collection('exploration_channels').doc(explorationChannelId).get();
    return doc.exists && doc.data()!.status === 'active' && doc.data()!.youtubeChannelId ? [doc] : [];
  }
  const snap = await adminDb.collection('exploration_channels').where('status', '==', 'active').get();
  return snap.docs
    .filter((d) => d.data().youtubeChannelId)
    .sort((a, b) => (millis(a.data().lastSweptAt) ?? 0) - (millis(b.data().lastSweptAt) ?? 0));
}

export function isQuotaExceededError(e: unknown): boolean {
  return e instanceof YouTubeApiError && (e.reason === 'quotaExceeded' || e.reason === 'dailyLimitExceeded');
}

export { getQuotaConsumed };
