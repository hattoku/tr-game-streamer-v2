// マイリストのカードの子エリア（最後に再生した動画）を、幅いっぱいの赤いボタンから「行全体のリンク＋右端の丸い再生アイコン」に
// 変えた確認項目。ページ マイリスト機能仕様書 v1.14 §5.3「続きから再生（行全体のリンク）」。
// 再生リスト・動画・マイリスト・視聴進捗は Admin SDK で直接作り、終了時に自分で消す（タイトルは [E2E] で始まる）。
import type { Browser, Page, TestInfo } from '@playwright/test';
import { expect, hasHorizontalScroll, test } from './support/fixtures';
import { AUTH_STATE, hideTestModeWidget } from './support/auth';
import { addGateCookie } from './support/gate';
import { db as e2eDb } from './support/cleanup';
import { randomId } from './support/collection';
import { setProgress, testUserUid } from './support/watch-progress';

test.describe.configure({ mode: 'serial' });

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** 後始末するドキュメントのパス */
const created: string[] = [];

test.afterEach(async () => {
  while (created.length > 0) {
    const path = created.pop()!;
    await e2eDb().doc(path).delete().catch(() => {});
  }
});

/** 2話の再生リストを作り、テスト用会員のマイリストに入れて1話目の途中まで見た状態にする */
async function seed(): Promise<{ playlistId: string; title: string; videoTitle: string }> {
  const uid = await testUserUid();
  const playlistId = randomId('PLE2E');
  const title = `[E2E] 続きから再生の行 ${playlistId}`;
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
  const videoTitle = `[E2E] 続きから再生の行 第1話 ${playlistId}`;
  for (const position of [0, 1]) {
    // YouTube の動画IDの形（11文字）にする。形が違うとプレーヤーが「Invalid video id」で落ちる
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
  // 最後に再生した順で先頭に来るよう、今の時刻で進捗を付ける
  await setProgress(uid, playlistId, firstVideoId, 120);
  created.push(`watch_progress/${uid}_${playlistId}_${firstVideoId}`);
  return { playlistId, title, videoTitle };
}

/** マイリストページのこの再生リストのカード */
function cardOf(page: Page, title: string) {
  return page.locator('div').filter({ has: page.getByRole('link', { name: title, exact: true }) }).filter({ hasText: '最後に再生' }).last();
}

/** テスト用会員でログインした、User-Agent を差し替えたページ（iPhone の表示の確認用） */
async function userPageWithUA(browser: Browser, baseURL: string, testInfo: TestInfo, userAgent: string): Promise<Page> {
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, viewport, isMobile, hasTouch, userAgent, storageState: AUTH_STATE.user });
  await addGateCookie(context, baseURL);
  await hideTestModeWidget(context);
  return context.newPage();
}

test('§5.3 子エリアは行全体が「続きから再生」のリンクで、幅いっぱいの赤いボタンは出さない', async ({ userPage }) => {
  const { playlistId, title, videoTitle } = await seed();
  await userPage.goto('/mylist');
  const row = userPage.getByRole('link', { name: `続きから再生: ${videoTitle}` });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('href', `/playlists/${playlistId}?autoplay=1`);

  // 行の中にサムネイルの進捗バー・タイトル・残り時間が入っている（行のどこを押しても遷移する）
  await expect(row.getByText(videoTitle)).toBeVisible();
  await expect(row.getByText('残り 8 分')).toBeVisible();

  // 以前の「続きから再生」「再生ページへ」の文字のボタンは無い
  const card = cardOf(userPage, title);
  await expect(card.getByText('続きから再生', { exact: true })).toHaveCount(0);
  await expect(card.getByText('再生ページへ', { exact: true })).toHaveCount(0);

  // 右端に丸い再生アイコン（直径 36px／PC 40px）があり、カード幅いっぱいの要素ではない
  const icon = row.getByTestId('mylist-continue-play-icon');
  await expect(icon).toHaveCount(1);
  const iconBox = (await icon.boundingBox())!;
  const rowBox = (await row.boundingBox())!;
  expect(iconBox.width).toBeLessThanOrEqual(40);
  expect(iconBox.x + iconBox.width).toBeGreaterThan(rowBox.x + rowBox.width - 40);
  expect(await hasHorizontalScroll(userPage)).toBe(false);

  // 押すと自動再生付きで再生リストのページへ（クエリはすぐ除去される）
  await row.click();
  await expect(userPage).toHaveURL(new RegExp(`/playlists/${playlistId}$`));
});

test('§5.3 自動再生できない環境（iPhone）では右矢印・読み上げ名「再生ページへ」の通常の遷移にする', async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'iPhone の表示はモバイル幅だけで確認する');
  const { playlistId, videoTitle } = await seed();
  const page = await userPageWithUA(browser, baseURL!, testInfo, IPHONE_UA);
  try {
    await page.goto('/mylist');
    const row = page.getByRole('link', { name: `再生ページへ: ${videoTitle}` });
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('href', `/playlists/${playlistId}`);
    await expect(row.getByTestId('mylist-continue-play-icon')).toHaveCount(0);
    await expect(row.getByTestId('mylist-continue-chevron')).toBeVisible();
  } finally {
    await page.context().close();
  }
});
