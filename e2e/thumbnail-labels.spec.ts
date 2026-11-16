// サムネイルに重ねる表記を「再生時間だけ」にそろえた確認項目（2026-11-15、共通 デザイントークン仕様書 v2.13 §6.5）。
// - 再生リストの表紙へ遷移するサムネイルには話数を重ねず、話数はサムネイルの周辺（カードの文字の並び）に置く
//   （マイリスト機能仕様書 v1.16 §5.2、ページ top 仕様書 v2.5 §5.4）
// - 再生できる動画へ遷移するサムネイルは右下に再生時間（視聴履歴 仕様書 v1.4 §4.2）
// 再生リスト・動画・マイリスト・視聴進捗・視聴履歴は Admin SDK で直接作り、終了時に自分で消す（タイトルは [E2E] で始まる）。
import type { Page } from '@playwright/test';
import { expect, hasHorizontalScroll, test } from './support/fixtures';
import { db as e2eDb } from './support/cleanup';
import { randomId } from './support/collection';
import { setProgress, testUserUid } from './support/watch-progress';

test.describe.configure({ mode: 'serial' });

/** 後始末するドキュメントのパス */
const created: string[] = [];

test.afterEach(async () => {
  while (created.length > 0) {
    const path = created.pop()!;
    await e2eDb().doc(path).delete().catch(() => {});
  }
});

/** 2話（各10分）の再生リストを作り、テスト用会員のマイリストに入れて1話目の途中まで見た状態にする（視聴履歴も付ける） */
async function seed(): Promise<{ playlistId: string; title: string; videoTitle: string }> {
  const uid = await testUserUid();
  const playlistId = randomId('PLE2E');
  const title = `[E2E] サムネイルの表記 ${playlistId}`;
  await e2eDb().collection('playlists').doc(playlistId).set({
    title, thumbnailUrl: '', channelId: null, channelName: 'E2E配信者', channelIconUrl: '',
    gameId: null, gameName: '', gameGenreIds: [], gameHint: null, gameSetBy: null, gameSetAt: null,
    videoCount: 2, latestVideoPublishedAt: null, registeredAt: new Date(), registeredBy: 'e2e', proposedBy: null,
    isPublic: true, score: null, reviewCount: 0, mylistCount: 0, playlistTagIds: [], playlistTagsFixed: [],
    referenceUrl: `https://www.youtube.com/playlist?list=${playlistId}`, lastFetchedAt: null,
    listingStatus: 'listed', listingReason: 'e2e', listingSetBy: 'admin', listingSetAt: new Date(),
    previousListingStatus: null, source: 'admin', explorationChannelId: null,
  });
  created.push(`playlists/${playlistId}`);

  let firstVideoId = '';
  const videoTitle = `[E2E] サムネイルの表記 第1話 ${playlistId}`;
  for (const position of [0, 1]) {
    // YouTube の動画IDの形（11文字）にする
    const youtubeVideoId = `E2E${position}${Math.random().toString(36).slice(2)}xxxxxxxx`.slice(0, 11);
    if (position === 0) firstVideoId = youtubeVideoId;
    const id = `${playlistId}_${youtubeVideoId}`;
    await e2eDb().collection('videos').doc(id).set({
      youtubeVideoId, playlistId, position, title: position === 0 ? videoTitle : `[E2E] 第2話 ${playlistId}`,
      thumbnailUrl: '', durationSeconds: 600, publishedAt: new Date(), addedToPlaylistAt: new Date(), playStartCount: 0,
    });
    created.push(`videos/${id}`);
  }

  const mylistId = `${uid}_${playlistId}`;
  await e2eDb().collection('mylist').doc(mylistId).set({
    userId: uid, playlistId, watchStatus: 'watching', isReverseOrder: false, createdAt: new Date(), updatedAt: new Date(),
  });
  created.push(`mylist/${mylistId}`);
  await setProgress(uid, playlistId, firstVideoId, 120);
  created.push(`watch_progress/${uid}_${playlistId}_${firstVideoId}`);

  const historyId = randomId('e2e-history-');
  await e2eDb().collection('watch_history').doc(historyId).set({
    userId: uid, playlistId, youtubeVideoId: firstVideoId, progressPercent: 20, watchedAt: new Date(),
  });
  created.push(`watch_history/${historyId}`);
  return { playlistId, title, videoTitle };
}

/** 再生リストの表紙（クエリなし）へ遷移するリンク（サムネイル・タイトル） */
function playlistThumbLinks(page: Page, playlistId: string) {
  return page.locator(`a[href="/playlists/${playlistId}"]`);
}

test('マイリスト §5.2 再生リストのサムネイルに話数を重ねず、配信者の横に話数を出す。子エリアのサムネイルは再生時間', async ({ userPage }) => {
  const { playlistId, title, videoTitle } = await seed();
  await userPage.goto('/mylist');
  const titleLink = userPage.getByRole('link', { name: title, exact: true });
  await expect(titleLink).toBeVisible();

  // 表紙へ遷移するサムネイル・タイトルのリンクの中には話数が無い
  const links = playlistThumbLinks(userPage, playlistId);
  await expect(links.first()).toBeVisible();
  await expect(links.getByText('2話')).toHaveCount(0);

  // 話数はカードの文字の並び（配信者名の横）に出る
  const card = userPage.locator('div').filter({ has: titleLink }).filter({ hasText: '最後に再生' }).last();
  const count = card.getByTestId('episode-count');
  await expect(count).toHaveText('2話');
  await expect(card.getByText('E2E配信者')).toBeVisible();

  // 再生できる動画へ遷移する子エリアのサムネイルには再生時間（10:00）
  const row = userPage.getByRole('link', { name: new RegExp(`: ${videoTitle.replace(/[[\]]/g, '\\$&')}$`) });
  await expect(row.getByText('10:00', { exact: true })).toBeVisible();
  expect(await hasHorizontalScroll(userPage)).toBe(false);
});

test('TOP §5.4 マイリストカードのサムネイルに話数を重ねず、ステータスの横に「話数 / 総話数」を出す', async ({ userPage }) => {
  const { playlistId, title } = await seed();
  await userPage.goto('/');
  // 同じ再生リストが再生リストのカルーセルにも出るため、ステータスのあるマイリストカードに絞る
  const card = userPage.locator(`a[href="/playlists/${playlistId}"]`).filter({ hasText: title }).filter({ hasText: '視聴中' });
  await expect(card).toBeVisible();
  await expect(card.getByTestId('episode-count')).toHaveText('1 / 2話');
  await expect(card.getByText('視聴中')).toBeVisible();

  // 話数はサムネイル（カード上部の16:9の枠）の外にある
  const thumb = card.locator('.aspect-video').first();
  await expect(thumb.getByText(/話/)).toHaveCount(0);
  const thumbBox = (await thumb.boundingBox())!;
  const countBox = (await card.getByTestId('episode-count').boundingBox())!;
  expect(countBox.y).toBeGreaterThanOrEqual(thumbBox.y + thumbBox.height);
});

test('視聴履歴 §4.2 再生時間はサムネイルの右下に重ね、配信者の下には出さない', async ({ userPage }) => {
  const { playlistId, videoTitle } = await seed();
  await userPage.goto('/history');
  const card = userPage.locator(`a[href="/playlists/${playlistId}"]`).filter({ hasText: videoTitle });
  await expect(card).toBeVisible();

  const duration = card.getByTestId('history-duration');
  await expect(duration).toHaveText('10:00');
  // 再生時間はサムネイル（16:9の枠）の中にある
  const thumb = card.locator('.aspect-video').first();
  await expect(thumb.getByTestId('history-duration')).toHaveCount(1);
  // サムネイルの外に再生時間の文字は無い（重複して出さない）
  await expect(card.getByText('10:00', { exact: true })).toHaveCount(1);
  expect(await hasHorizontalScroll(userPage)).toBe(false);
});
