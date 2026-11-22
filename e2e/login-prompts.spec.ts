// アカウント作成導線の改善（2026-11-17）。未ログインでログインが必要な操作をしたとき、いきなりログイン画面へ移さず、
// 押した操作に合わせた見出し・本文のログイン要求モーダルを出す。アカウント作成・ログインのあとは元の場所（押したリンクの遷移先）へ戻す。
// 共通 uiコンポーネント フロント 仕様書 v2.11 §2.7・§5、ページ ログイン アカウント登録・ログイン仕様書 v1.13 §3、
// ページ 再生リスト レビュー投稿機能 仕様書（ログイン要求モーダル）、ページ 再生リストを追加する 仕様書 §1.4。
// 対象（ゲーム・チャンネル・再生リスト）は Admin SDK で直接作り（[E2E] で始まる名前、ID は PLE2E／UCE2E）、終わったら消す。
import type { Page } from '@playwright/test';
import { expect, hasHorizontalScroll, test } from './support/fixtures';
import { uniqueText } from './support/env';
import { db as e2eDb } from './support/cleanup';
import { randomId } from './support/collection';
import { waitForGuest } from './support/guest';

async function seed() {
  const gameRef = e2eDb().collection('games').doc();
  const gameTitle = uniqueText('ログイン案内のゲーム');
  await gameRef.set({
    title: gameTitle, aliases: [], packageImageUrl: null, rakutenUrl: null, description: '', isAiGeneratedDescription: false, platforms: [],
    genreId: null, genreName: null, themeIds: [], gameTagIds: [], gameTagsFixed: [], playlistCount: 1, createdAt: new Date(), updatedAt: new Date(),
  });
  const channelId = randomId('UCE2E');
  const channelName = uniqueText('ログイン案内のチャンネル');
  await e2eDb().collection('channels').doc(channelId).set({
    youtubeChannelId: channelId, name: channelName, iconUrl: '', description: null, isAiGeneratedDescription: false, subscriberCount: null,
    playlistCount: 1, registeredAt: new Date(), lastFetchedAt: null,
  });
  const playlistId = randomId('PLE2E');
  await e2eDb().collection('playlists').doc(playlistId).set({
    title: uniqueText('ログイン案内の再生リスト'), thumbnailUrl: '', channelId, channelName, channelIconUrl: '',
    gameId: gameRef.id, gameName: gameTitle, gameGenreIds: [], gameHint: null, gameSetBy: null, gameSetAt: null,
    videoCount: 0, latestVideoPublishedAt: null, registeredAt: new Date(), registeredBy: 'e2e', proposedBy: null,
    isPublic: true, listingStatus: 'listed', listingSetBy: 'auto', score: null, reviewCount: 0, mylistCount: 0, playlistTagIds: [], playlistTagsFixed: [],
    referenceUrl: '', lastFetchedAt: null,
  });
  return {
    gameId: gameRef.id,
    channelId,
    playlistId,
    async cleanup() {
      await Promise.all([
        e2eDb().collection('playlists').doc(playlistId).delete(),
        e2eDb().collection('channels').doc(channelId).delete(),
        gameRef.delete(),
      ]);
    },
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;
let data: Seed;
test.beforeAll(async () => {
  data = await seed();
});
test.afterAll(async () => {
  await data?.cleanup();
});

/** 開いているログイン要求モーダル。見出し・本文・2つのリンク先を確かめて閉じる */
async function expectLoginPrompt(page: Page, opts: { title: string; description: string; next: string }) {
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: opts.title })).toBeVisible();
  await expect(dialog).toContainText(opts.description);
  const next = encodeURIComponent(opts.next);
  await expect(dialog.getByRole('link', { name: 'アカウントを作成する' })).toHaveAttribute('href', `/login?mode=signup&next=${next}`);
  await expect(dialog.getByRole('link', { name: 'ログイン', exact: true })).toHaveAttribute('href', `/login?next=${next}`);
  expect(await hasHorizontalScroll(page)).toBe(false);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
}

test.describe('ボトムタブ（UI仕様書 §2.7）', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'ボトムタブはモバイル幅だけに出る');
  });

  test('未ログインで「マイリスト」「マイページ」を押すと、その場で何ができるかの案内が出る', async ({ guestPage }) => {
    await guestPage.goto('/');
    await waitForGuest(guestPage);
    const nav = guestPage.getByRole('navigation', { name: 'メインナビゲーション' });
    await nav.getByRole('link', { name: 'マイリスト' }).click();
    await expect(guestPage).toHaveURL(/\/$/);
    await expectLoginPrompt(guestPage, {
      title: 'マイリストを使うにはアカウントが必要です',
      description: '続きからすぐに再生できます',
      next: '/mylist',
    });
    await nav.getByRole('link', { name: 'マイページ' }).click();
    await expect(guestPage).toHaveURL(/\/$/);
    await expectLoginPrompt(guestPage, {
      title: 'マイページを使うにはアカウントが必要です',
      description: '提案した再生リストの進み具合',
      next: '/mypage',
    });
  });

  test('ログイン中はそのまま開く', async ({ userPage }) => {
    await userPage.goto('/');
    const nav = userPage.getByRole('navigation', { name: 'メインナビゲーション' });
    await nav.getByRole('link', { name: 'マイリスト' }).click();
    await expect(userPage).toHaveURL(/\/mylist$/);
    await expect(userPage.getByRole('dialog')).toHaveCount(0);
  });
});

test('再生リスト詳細: 視聴ステータス・星評価・レビュー投稿で、それぞれの操作に合わせた案内が出る（レビュー投稿機能仕様書）', async ({ guestPage }) => {
  await guestPage.goto(`/playlists/${data.playlistId}`);
  const next = `/playlists/${data.playlistId}`;
  // 視聴ステータスとレビューのカードは PC・モバイル用に2つ描くため、見えている方を押す
  await guestPage.getByRole('button', { name: '見たい', exact: true }).filter({ visible: true }).first().click();
  await expectLoginPrompt(guestPage, {
    title: '視聴ステータスを記録するにはアカウントが必要です',
    description: 'マイリストに入り',
    next,
  });
  await guestPage.getByRole('button', { name: '★4', exact: true }).filter({ visible: true }).first().click();
  await expectLoginPrompt(guestPage, {
    title: '評価をつけるにはアカウントが必要です',
    description: '星5段階の評価',
    next,
  });
  await guestPage.getByRole('button', { name: 'レビューを投稿する', exact: true }).filter({ visible: true }).first().click();
  await expectLoginPrompt(guestPage, {
    title: 'レビューを投稿するにはアカウントが必要です',
    description: '感想をレビューとして投稿',
    next,
  });
});

test('「再生リストを追加する」: 未ログインは遷移せずに案内を出し、ログイン後は追加ページへ戻す（再生リストを追加する仕様書 §1.4）', async ({ guestPage }, testInfo) => {
  const prompt = { title: '再生リストを追加するにはアカウントが必要です', description: 'まだ載っていないゲーム実況の再生リストを提案できます' };

  await test.step('チャンネル詳細（上のボタンと一覧のボタン）', async () => {
    await guestPage.goto(`/channels/${data.channelId}`);
    await waitForGuest(guestPage);
    const href = `/propose?channelId=${data.channelId}`;
    const buttons = guestPage.locator('main').getByRole('link', { name: '再生リストを追加する' }).filter({ visible: true });
    await expect(buttons).toHaveCount(2, { timeout: 30_000 });
    for (const i of [0, 1]) {
      await buttons.nth(i).click();
      await expect(guestPage).toHaveURL(new RegExp(`/channels/${data.channelId}$`));
      await expectLoginPrompt(guestPage, { ...prompt, next: href });
    }
  });

  await test.step('ゲームタイトル詳細', async () => {
    await guestPage.goto(`/games/${data.gameId}`);
    await waitForGuest(guestPage);
    const button = guestPage.locator('main').getByRole('link', { name: '再生リストを追加する' }).filter({ visible: true }).first();
    await button.click();
    await expectLoginPrompt(guestPage, { ...prompt, next: `/propose?gameId=${data.gameId}` });
  });

  await test.step('再生リストを探す（PCは見出しのボタン、モバイルは「＋」の浮きボタン）', async () => {
    await guestPage.goto('/playlists');
    await waitForGuest(guestPage);
    const button =
      testInfo.project.name === 'mobile'
        ? guestPage.getByTestId('add-playlist-fab')
        : guestPage.locator('main').getByRole('link', { name: '再生リストを追加する' }).filter({ visible: true }).first();
    await button.click();
    await expect(guestPage).toHaveURL(/\/playlists$/);
    // ログインを選ぶと、ログイン後に追加ページへ戻るリンクになっている
    const dialog = guestPage.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: prompt.title })).toBeVisible();
    await dialog.getByRole('link', { name: 'ログイン', exact: true }).click();
    await expect(guestPage).toHaveURL(/\/login\?next=%2Fpropose$/);
  });
});

test('ログイン中の「再生リストを追加する」は案内を出さずに追加ページを開く', async ({ userPage }) => {
  await userPage.goto(`/channels/${data.channelId}`);
  const button = userPage.locator('main').getByRole('link', { name: '再生リストを追加する' }).filter({ visible: true }).first();
  await expect(button).toBeVisible({ timeout: 30_000 });
  await button.click();
  await expect(userPage).toHaveURL(new RegExp(`/propose\\?channelId=${data.channelId}$`));
  await expect(userPage.getByRole('dialog')).toHaveCount(0);
});

test('「チャンネルを申請する」「掲載を申請する」も、未ログインは申請の案内を出す', async ({ guestPage }) => {
  const prompt = { title: 'チャンネルを申請するにはアカウントが必要です', description: 'まだ載っていないゲーム実況のチャンネルを申請できます' };
  await guestPage.goto('/channels');
  await waitForGuest(guestPage);
  await guestPage.getByTestId('channel-apply-hint').getByRole('link', { name: 'チャンネルを申請する' }).click();
  await expectLoginPrompt(guestPage, { ...prompt, next: '/propose?type=channel' });
  await guestPage.goto('/creators');
  await waitForGuest(guestPage);
  await guestPage.getByRole('link', { name: '掲載を申請する' }).click();
  await expect(guestPage).toHaveURL(/\/creators$/);
  await expectLoginPrompt(guestPage, { ...prompt, next: '/propose?type=channel&as=creator' });
});
