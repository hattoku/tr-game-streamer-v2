// 再生リスト詳細の配信者情報セクションに出す件数（ページ 再生リスト詳細 仕様書 v1.17「配信者情報セクション」表示要素の「件数」）。
// チャンネルと再生リストは Admin SDK で直接作り、終了時に自分で消す（名前は [E2E] で始まる）。
import { expect, hasHorizontalScroll, test } from './support/fixtures';
import { uniqueText } from './support/env';
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

async function seedPlaylist(channelId: string, channelName: string, extra: { videoCount: number; mylistCount: number; listingStatus?: string }) {
  const id = randomId('PLE2E');
  await e2eDb().collection('playlists').doc(id).set({
    title: uniqueText('配信者欄の件数'), thumbnailUrl: '', channelId, channelName, channelIconUrl: '',
    gameId: null, gameName: '', gameGenreIds: [], gameHint: null, gameSetBy: null, gameSetAt: null,
    videoCount: extra.videoCount, latestVideoPublishedAt: null, registeredAt: new Date(), registeredBy: 'e2e', proposedBy: null,
    isPublic: true, listingStatus: extra.listingStatus ?? 'listed', score: null, reviewCount: 3, mylistCount: extra.mylistCount,
    playlistTagIds: [], playlistTagsFixed: [], referenceUrl: '', lastFetchedAt: null,
  });
  return id;
}

test('配信者情報 件数: 掲載中の再生リスト数・動画数の合計・マイリスト数の合計を出し、レビュー数は出さない', async ({ guestPage }) => {
  const channelName = uniqueText('配信者欄のチャンネル');
  const channelId = await seedChannel(channelName);
  const ids: string[] = [];
  try {
    ids.push(await seedPlaylist(channelId, channelName, { videoCount: 12, mylistCount: 2 }));
    ids.push(await seedPlaylist(channelId, channelName, { videoCount: 30, mylistCount: 5 }));
    // 掲載していない再生リストは数えない（チャンネル詳細の見出しと同じ数え方）
    ids.push(await seedPlaylist(channelId, channelName, { videoCount: 100, mylistCount: 50, listingStatus: 'unconfirmed' }));

    // サーバーの索引に載るまで待つ
    await expect
      .poll(async () => {
        const res = await guestPage.request.get(`/api/catalog/playlists?channelId=${channelId}&sort=score&page=1`);
        return res.ok() ? ((await res.json()) as { total: number }).total : -1;
      }, { timeout: 30_000, intervals: [500, 1000, 2000] })
      .toBe(2);

    await guestPage.goto(`/playlists/${ids[0]}`);
    const stats = guestPage.getByTestId('channel-card-stats').first();
    await expect(stats).toBeVisible({ timeout: 30_000 });
    await expect(stats).toContainText('2 再生リスト');
    await expect(stats).toContainText('42 動画');
    await expect(stats).toContainText('7 マイリスト');
    await expect(stats).not.toContainText('レビュー');
    expect(await hasHorizontalScroll(guestPage)).toBe(false);
  } finally {
    await Promise.all([...ids.map((id) => e2eDb().collection('playlists').doc(id).delete()), e2eDb().collection('channels').doc(channelId).delete()]);
  }
});
