// 再生リストが多いチャンネルのカード（ページ チャンネル 探す 仕様書 v2.3 §9.6）の確認項目。
// 再生リスト・チャンネルは Admin SDK で直接作り、終了時に自分で消す（名前は [E2E] で始まる）。
// desktop と mobile で同時に走るため、検索の目印（token）はテストごとに一意にする。
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { db as e2eDb } from './support/cleanup';
import { randomId } from './support/collection';

async function seedChannel(name: string) {
  const id = randomId('UCE2E');
  await e2eDb().collection('channels').doc(id).set({
    youtubeChannelId: id, name, iconUrl: '', description: null, isAiGeneratedDescription: false, subscriberCount: null,
    playlistCount: 0, registeredAt: new Date(), lastFetchedAt: null,
  });
  return id;
}

/** スコア count, count-1, … 1 の再生リストを作る。サムネイルは `thumb-<スコア>`（index が空なら空文字） */
async function seedPlaylists(channelId: string, channelName: string, count: number, emptyThumbScores: number[] = []) {
  const batch = e2eDb().batch();
  const ids = Array.from({ length: count }, (_, i) => {
    const score = count - i;
    const id = randomId('PLE2E');
    batch.set(e2eDb().collection('playlists').doc(id), {
      title: `[E2E] 多いチャンネルの再生リスト ${score}`,
      thumbnailUrl: emptyThumbScores.includes(score) ? '' : `https://i.ytimg.com/vi/e2e-thumb-${score}/hqdefault.jpg`,
      channelId, channelName, channelIconUrl: '',
      gameId: null, gameName: '', gameGenreIds: [], gameHint: null, gameSetBy: null, gameSetAt: null,
      videoCount: 10, latestVideoPublishedAt: null, registeredAt: new Date(), registeredBy: 'e2e', proposedBy: null,
      isPublic: true, score, reviewCount: 0, mylistCount: 0, playlistTagIds: [], playlistTagsFixed: [],
      referenceUrl: '', lastFetchedAt: null,
      listingStatus: 'listed', listingReason: 'e2e', listingSetBy: 'admin', listingSetAt: new Date(),
      previousListingStatus: null, source: 'admin', explorationChannelId: null,
    });
    return id;
  });
  await batch.commit();
  return ids;
}

async function cleanup(playlistIds: string[], channelId: string) {
  await Promise.all([
    ...playlistIds.map((id) => e2eDb().collection('playlists').doc(id).delete()),
    e2eDb().collection('channels').doc(channelId).delete(),
  ]);
}

function token() {
  return Math.random().toString(36).slice(2, 10);
}

type ChannelPage = { items: Array<{ id: string; playlistCount: number; topPlaylists: unknown[]; moreThumbnailUrls: string[] }>; total: number };

async function channelUntil(request: APIRequestContext, t: string, playlistCount: number): Promise<ChannelPage> {
  let body: ChannelPage | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`/api/catalog/channels?q=${encodeURIComponent(t)}`);
        if (!res.ok()) return false;
        body = (await res.json()) as ChannelPage;
        return body.total === 1 && body.items[0].playlistCount === playlistCount;
      },
      { timeout: 30_000, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
  return body!;
}

test('§9.6 ピックアップより多いときは「ほか N 本の再生リスト」を出し、次の再生リストのサムネイルを重ねる', async ({ guestPage, request }) => {
  const t = token();
  const channelName = `[E2E] オオイ ${t}`;
  const channelId = await seedChannel(channelName);
  // スコア 8..1。スコア 4 はサムネイル無しなので飛ばされ、5・3・2 が重なる
  const ids = await seedPlaylists(channelId, channelName, 8, [4]);
  try {
    const body = await channelUntil(request, t, 8);
    expect(body.items[0].topPlaylists).toHaveLength(3);
    expect(body.items[0].moreThumbnailUrls).toEqual([5, 3, 2].map((s) => `https://i.ytimg.com/vi/e2e-thumb-${s}/hqdefault.jpg`));

    await guestPage.goto('/channels');
    await guestPage.getByLabel('チャンネル名で検索').filter({ visible: true }).fill(t);
    // 目印で絞り込むと一覧はこのチャンネルだけになる
    await expect(guestPage.getByText(channelName)).toBeVisible({ timeout: 30_000 });
    await expect(guestPage.getByText('評価の高い再生リスト')).toBeVisible();
    const more = guestPage.getByTestId('channel-card-more');
    await expect(more).toContainText('ほか 5 本の再生リスト');
    await expect(more).toContainText('すべて見る');
    await expect(more.locator('img')).toHaveCount(3);
    await more.click();
    await expect(guestPage).toHaveURL(new RegExp(`/channels/${channelId}$`));
  } finally {
    await cleanup(ids, channelId);
  }
});

test('§9.6 再生リストが3本以下のときは「ほか N 本」を出さない', async ({ guestPage, request }) => {
  const t = token();
  const channelName = `[E2E] スクナイ ${t}`;
  const channelId = await seedChannel(channelName);
  const ids = await seedPlaylists(channelId, channelName, 3);
  try {
    const body = await channelUntil(request, t, 3);
    expect(body.items[0].moreThumbnailUrls).toEqual([]);

    await guestPage.goto('/channels');
    await guestPage.getByLabel('チャンネル名で検索').filter({ visible: true }).fill(t);
    await expect(guestPage.getByText(channelName)).toBeVisible({ timeout: 30_000 });
    await expect(guestPage.getByText('評価の高い再生リスト')).toBeVisible();
    await expect(guestPage.getByTestId('channel-card-more')).toHaveCount(0);
  } finally {
    await cleanup(ids, channelId);
  }
});
