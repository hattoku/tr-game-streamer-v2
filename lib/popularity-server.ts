// 人気のチャンネルの集計（リブランディング段階5。仕様: 共通 人気のチャンネル 集計 仕様書）。
// サーバー専用（API Route からのみ import すること）。
//
// チャンネルごとに、掲載中の再生リストを「マイリストに入れている人」「レビューを書いた人」「視聴を始めた人」を、
// 同じ人は1人として数え、直近30日の人数と合わせて `channels.popularity` に保存する（§3・§4）。
// 点数（重みを掛けた合計）は保存せず、並べるときに lib/popularity-shared.ts の popularityScore で計算する。
//
// 視聴を始めた人は `watch_history`（動画ごと・本人が消せる）から直接は数えず、前回の集計より後に増えた・更新された
// `watch_history` だけを読んで `playlist_viewers/{userId}_{playlistId}` を1件ずつ作り、そちらを数える（§2.3）。
import { FieldPath, Timestamp, type DocumentData, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { LISTED } from './listing';
import {
  RECENT_DAYS,
  ZERO_POPULARITY,
  readPopularity,
  samePopularity,
  type PopularityCounts,
  type PopularityRunSummary,
} from './popularity-shared';

const DAY_MS = 24 * 60 * 60 * 1000;
/** 前回の集計の時刻より、これだけ前から watch_history を読む（書き込みの時刻のずれ・集計中の書き込みの取りこぼし対策） */
const VIEWER_OVERLAP_MS = 5 * 60 * 1000;
const BATCH_SIZE = 400;
/** 大きいコレクションを読むときの1回の件数（一度に全件を読まない） */
const PAGE_SIZE = 5000;

export const POPULARITY_STATE_DOC = 'channel_popularity';

function millis(value: unknown): number | null {
  return (value as { toMillis?: () => number } | null | undefined)?.toMillis?.() ?? null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

/**
 * 必要な項目だけを PAGE_SIZE 件ずつ読む。`orderField` を渡したときはその項目の順（範囲の条件をかける項目と同じにする）、
 * 無ければドキュメントID順。続きは前のページの最後の文書から読む。
 */
async function readAll(
  query: Query<DocumentData>,
  fields: string[],
  each: (data: DocumentData, id: string) => void,
  orderField?: string,
): Promise<void> {
  let last: QueryDocumentSnapshot<DocumentData> | null = null;
  for (;;) {
    let q = query.select(...fields).orderBy(orderField ?? FieldPath.documentId()).limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    for (const d of snap.docs) each(d.data(), d.id);
    if (snap.size < PAGE_SIZE) return;
    last = snap.docs[snap.docs.length - 1];
  }
}

/** 1種類分の「チャンネル → (ユーザー → 一番新しい日時)」 */
type PeopleByChannel = Map<string, Map<string, number>>;

function addPerson(map: PeopleByChannel, channelId: string, userId: string, at: number) {
  let people = map.get(channelId);
  if (!people) map.set(channelId, (people = new Map()));
  if ((people.get(userId) ?? -1) < at) people.set(userId, at);
}

function countPeople(people: Map<string, number> | undefined, recentFrom: number): [number, number] {
  if (!people) return [0, 0];
  let recent = 0;
  for (const at of people.values()) if (at >= recentFrom) recent += 1;
  return [people.size, recent];
}

/**
 * 前回の集計より後の watch_history から、まだ無い playlist_viewers を作る（§2.3）。
 * `viewers` には今ある分を渡し、作った分もここに足す。作った件数を返す。
 */
async function syncViewers(viewers: Map<string, { userId: string; playlistId: string; firstWatchedAt: number }>, since: number | null): Promise<number> {
  const found = new Map<string, { userId: string; playlistId: string; firstWatchedAt: number }>();
  const base = adminDb.collection('watch_history');
  const query = since === null ? base : base.where('watchedAt', '>=', Timestamp.fromMillis(since - VIEWER_OVERLAP_MS));
  await readAll(query, ['userId', 'playlistId', 'watchedAt'], (data) => {
    const userId = str(data.userId);
    const playlistId = str(data.playlistId);
    const watchedAt = millis(data.watchedAt);
    if (!userId || !playlistId || watchedAt === null) return;
    const key = `${userId}_${playlistId}`;
    if (viewers.has(key)) return;
    const prev = found.get(key);
    if (!prev || watchedAt < prev.firstWatchedAt) found.set(key, { userId, playlistId, firstWatchedAt: watchedAt });
  }, since === null ? undefined : 'watchedAt');

  const entries = [...found.entries()];
  const createdAt = Timestamp.now();
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = adminDb.batch();
    for (const [key, v] of entries.slice(i, i + BATCH_SIZE)) {
      batch.set(adminDb.collection('playlist_viewers').doc(key), {
        userId: v.userId,
        playlistId: v.playlistId,
        firstWatchedAt: Timestamp.fromMillis(v.firstWatchedAt),
        createdAt,
      });
    }
    await batch.commit();
  }
  for (const [key, v] of entries) viewers.set(key, v);
  return entries.length;
}

/** チャンネルの人気の数字を数え直して保存する（§3）。毎日の定期実行と管理画面の「今すぐ集計する」から呼ぶ */
export async function recomputeChannelPopularity(now = new Date()): Promise<PopularityRunSummary> {
  const nowMs = now.getTime();
  const recentFrom = nowMs - RECENT_DAYS * DAY_MS;
  const stateRef = adminDb.collection('batch_state').doc(POPULARITY_STATE_DOC);

  // ① 掲載中の再生リストのチャンネル
  const channelOfPlaylist = new Map<string, string>();
  const listedSnap = await adminDb.collection('playlists').where('isPublic', '==', true).where('listingStatus', '==', LISTED).select('channelId').get();
  for (const d of listedSnap.docs) {
    const channelId = str(d.get('channelId'));
    if (channelId) channelOfPlaylist.set(d.id, channelId);
  }

  // ② 視聴を始めた人の記録を増やす
  const viewers = new Map<string, { userId: string; playlistId: string; firstWatchedAt: number }>();
  await readAll(adminDb.collection('playlist_viewers'), ['userId', 'playlistId', 'firstWatchedAt'], (data, id) => {
    const userId = str(data.userId);
    const playlistId = str(data.playlistId);
    if (userId && playlistId) viewers.set(id, { userId, playlistId, firstWatchedAt: millis(data.firstWatchedAt) ?? 0 });
  });
  const lastRunAt = millis((await stateRef.get()).get('lastRunAt'));
  const newViewerCount = await syncViewers(viewers, lastRunAt);

  // ③ チャンネルごとに、同じ人を1人として数える
  const mylist: PeopleByChannel = new Map();
  const reviews: PeopleByChannel = new Map();
  const viewed: PeopleByChannel = new Map();
  await readAll(adminDb.collection('mylist'), ['userId', 'playlistId', 'createdAt'], (data) => {
    const userId = str(data.userId);
    const channelId = channelOfPlaylist.get(str(data.playlistId) ?? '');
    if (userId && channelId) addPerson(mylist, channelId, userId, millis(data.createdAt) ?? 0);
  });
  await readAll(adminDb.collection('reviews'), ['userId', 'playlistId', 'postedAt', 'isHidden'], (data) => {
    if (data.isHidden === true) return;
    const userId = str(data.userId);
    const channelId = channelOfPlaylist.get(str(data.playlistId) ?? '');
    if (userId && channelId) addPerson(reviews, channelId, userId, millis(data.postedAt) ?? 0);
  });
  for (const v of viewers.values()) {
    const channelId = channelOfPlaylist.get(v.playlistId);
    if (channelId) addPerson(viewed, channelId, v.userId, v.firstWatchedAt);
  }

  // ④ 数が変わったチャンネルだけ書き直す（0になったチャンネルも0で書き直す）
  const listedChannels = new Set(channelOfPlaylist.values());
  const computedAt = Timestamp.fromMillis(nowMs);
  const updates: Array<{ id: string; counts: PopularityCounts }> = [];
  const channelsSnap = await adminDb.collection('channels').select('popularity').get();
  for (const d of channelsSnap.docs) {
    const current = d.get('popularity');
    let counts: PopularityCounts = ZERO_POPULARITY;
    if (listedChannels.has(d.id)) {
      const [mylistUsers, recentMylistUsers] = countPeople(mylist.get(d.id), recentFrom);
      const [reviewUsers, recentReviewUsers] = countPeople(reviews.get(d.id), recentFrom);
      const [viewerUsers, recentViewerUsers] = countPeople(viewed.get(d.id), recentFrom);
      counts = { mylistUsers, reviewUsers, viewerUsers, recentMylistUsers, recentReviewUsers, recentViewerUsers };
    }
    // 一度も集計していない（popularity が無い）チャンネルは、0 のままなら書かない
    if (current == null ? samePopularity(counts, ZERO_POPULARITY) : samePopularity(counts, readPopularity(current))) continue;
    updates.push({ id: d.id, counts });
  }
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = adminDb.batch();
    for (const u of updates.slice(i, i + BATCH_SIZE)) {
      batch.update(adminDb.collection('channels').doc(u.id), { popularity: { ...u.counts, computedAt } });
    }
    await batch.commit();
  }

  // ⑤ 次の集計はここから（集計を始めた時刻。集計中の視聴は次の回の重なりで拾う）
  await stateRef.set({ lastRunAt: computedAt }, { merge: true });

  return { processedCount: listedChannels.size, updatedChannelCount: updates.length, newViewerCount, computedAt: nowMs };
}

/** 最後に集計した日時（管理画面の表示用）。まだ一度も集計していなければ null */
export async function lastPopularityRunAt(): Promise<number | null> {
  return millis((await adminDb.collection('batch_state').doc(POPULARITY_STATE_DOC).get()).get('lastRunAt'));
}
