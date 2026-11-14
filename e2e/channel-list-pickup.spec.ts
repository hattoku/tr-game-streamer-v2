// チャンネル名から探すのピックアップ再生リストの行（ページ チャンネル 探す 仕様書 v2.3 §9.5）。
// 各行のタイトルの下に、スコア・マイリスト数・話数・最新話の日付を出す。
// 再生リスト・チャンネルは Admin SDK で直接作り、終了時に自分で消す（名前は [E2E] で始まる）。
// desktop と mobile で同時に走るため、検索の目印（token）はテストごとに一意にする。
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { db as e2eDb } from './support/cleanup';
import { randomId } from './support/collection';

interface SeedPlaylist {
  title: string;
  score: number | null;
  mylistCount: number;
  videoCount: number;
  latestVideoPublishedAt: Date | null;
}

async function seedChannelWithPlaylists(channelName: string, list: SeedPlaylist[]) {
  const channelId = randomId('UCE2E');
  await e2eDb().collection('channels').doc(channelId).set({
    youtubeChannelId: channelId, name: channelName, iconUrl: '', description: null, isAiGeneratedDescription: false, subscriberCount: null,
    playlistCount: 0, registeredAt: new Date(), lastFetchedAt: null,
  });
  const batch = e2eDb().batch();
  const playlistIds = list.map((p) => {
    const id = randomId('PLE2E');
    batch.set(e2eDb().collection('playlists').doc(id), {
      title: p.title, thumbnailUrl: '', channelId, channelName, channelIconUrl: '',
      gameId: null, gameName: '', gameGenreIds: [], gameHint: null, gameSetBy: null, gameSetAt: null,
      videoCount: p.videoCount, latestVideoPublishedAt: p.latestVideoPublishedAt, registeredAt: new Date(), registeredBy: 'e2e', proposedBy: null,
      isPublic: true, score: p.score, reviewCount: 0, mylistCount: p.mylistCount, playlistTagIds: [], playlistTagsFixed: [],
      referenceUrl: '', lastFetchedAt: null,
      listingStatus: 'listed', listingReason: 'e2e', listingSetBy: 'admin', listingSetAt: new Date(),
      previousListingStatus: null, source: 'admin', explorationChannelId: null,
    });
    return id;
  });
  await batch.commit();
  return { channelId, playlistIds };
}

async function cleanup(channelId: string, playlistIds: string[]) {
  await Promise.all([
    ...playlistIds.map((id) => e2eDb().collection('playlists').doc(id).delete()),
    e2eDb().collection('channels').doc(channelId).delete(),
  ]);
}

function token() {
  return Math.random().toString(36).slice(2, 10);
}

/** 索引への反映は数秒かかることがあるので、条件を満たすまで呼び直す */
async function apiUntil<T>(request: APIRequestContext, path: string, ok: (body: T) => boolean): Promise<T> {
  let body: T | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(path);
        if (!res.ok()) return false;
        body = (await res.json()) as T;
        return ok(body);
      },
      { timeout: 30_000, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
  return body!;
}

async function searchChannel(page: Page, keyword: string) {
  await page.goto('/channels');
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.getByLabel('チャンネル名で検索').filter({ visible: true }).fill(keyword);
}

type ChannelPage = {
  items: Array<{
    id: string;
    topPlaylists: Array<{ id: string; score: number | null; mylistCount: number; videoCount: number; latestVideoPublishedAt: number | null }>;
  }>;
  total: number;
};

// 日付はどのタイムゾーンでも同じ日になるよう、UTC の正午にする
const LATEST = new Date(Date.UTC(2026, 10, 12, 12, 0, 0));

test('§9.5 ピックアップの各行にスコア・マイリスト数・話数・最新話の日付が出る（最新話の日付が無い行は日付を出さない）', async ({ guestPage, request }) => {
  const t = token();
  const channelName = `[E2E] ピックアップ行 ${t}`;
  const { channelId, playlistIds } = await seedChannelWithPlaylists(channelName, [
    { title: `[E2E] 行A ${t}`, score: 4.5, mylistCount: 1234, videoCount: 48, latestVideoPublishedAt: LATEST },
    { title: `[E2E] 行B ${t}`, score: null, mylistCount: 0, videoCount: 7, latestVideoPublishedAt: null },
  ]);
  const [a, b] = playlistIds;
  try {
    // API: ピックアップに数と日付が入る（共通 一覧のサーバー側検索 仕様書 v1.3）
    const body = await apiUntil<ChannelPage>(request, `/api/catalog/channels?q=${encodeURIComponent(t)}`, (r) => r.total === 1 && r.items[0].topPlaylists.length === 2);
    const [pa, pb] = body.items[0].topPlaylists;
    expect(pa).toMatchObject({ id: a, score: 4.5, mylistCount: 1234, videoCount: 48, latestVideoPublishedAt: LATEST.getTime() });
    expect(pb).toMatchObject({ id: b, score: null, mylistCount: 0, videoCount: 7, latestVideoPublishedAt: null });

    // 画面
    await searchChannel(guestPage, t);
    const rowA = guestPage.locator(`a[href="/playlists/${a}"]`);
    await expect(rowA).toBeVisible({ timeout: 30_000 });
    await expect(rowA).toContainText('4.5');
    await expect(rowA).toContainText('1,234');
    await expect(rowA).toContainText('48話');
    await expect(rowA).toContainText('最新話 2026/11/12');

    const rowB = guestPage.locator(`a[href="/playlists/${b}"]`);
    await expect(rowB).toContainText('評価なし');
    await expect(rowB).toContainText('7話');
    await expect(rowB).not.toContainText('最新話');
  } finally {
    await cleanup(channelId, playlistIds);
  }
});
