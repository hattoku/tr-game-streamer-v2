// 掲載状態（playlists.listingStatus）の確認項目（リブランディング段階3）。
// コンテンツ収集機能仕様書 §10.7・§10.9、ページ 再生リストを探す 仕様書 v2.0（掲載中だけを出す）、
// ページ チャンネル 探す 仕様書 §9.1、ページ チャンネル 詳細 仕様書 §8.1、ページ ゲームタイトル 探す 仕様書 v1.5（件数は掲載中だけ）。
// 再生リスト・チャンネル・ゲームは Admin SDK で直接作り、終了時に自分で消す（名前は [E2E] で始まる）。
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { uniqueText } from './support/env';
import { db as e2eDb } from './support/cleanup';
import { randomId } from './support/collection';

async function seedPlaylist(params: { channelId: string; channelName: string; listingStatus: string; gameId?: string | null; gameName?: string; title?: string }) {
  const id = randomId('PLE2E');
  const title = params.title ?? uniqueText('掲載状態の再生リスト');
  await e2eDb().collection('playlists').doc(id).set({
    title, thumbnailUrl: '', channelId: params.channelId, channelName: params.channelName, channelIconUrl: '',
    gameId: params.gameId ?? null, gameName: params.gameName ?? '', gameGenreIds: [], gameHint: null, gameSetBy: null, gameSetAt: null,
    videoCount: 10, latestVideoPublishedAt: null, registeredAt: new Date(), registeredBy: 'e2e', proposedBy: null,
    isPublic: true, score: null, reviewCount: 0, mylistCount: 0, playlistTagIds: [], playlistTagsFixed: [],
    referenceUrl: '', lastFetchedAt: null,
    listingStatus: params.listingStatus, listingReason: 'e2e', listingSetBy: 'admin', listingSetAt: new Date(),
    previousListingStatus: params.listingStatus === 'channel_off' ? 'listed' : null, source: 'admin', explorationChannelId: null,
  });
  return { id, title };
}

async function seedChannel(name: string) {
  const id = randomId('UCE2E');
  await e2eDb().collection('channels').doc(id).set({
    youtubeChannelId: id, name, iconUrl: '', description: null, isAiGeneratedDescription: false, subscriberCount: null,
    playlistCount: 0, registeredAt: new Date(), lastFetchedAt: null,
  });
  return id;
}

async function seedGame(title: string) {
  const ref = e2eDb().collection('games').doc();
  await ref.set({
    title, aliases: [], packageImageUrl: null, rakutenUrl: null, description: '', isAiGeneratedDescription: false, platforms: [],
    genreId: null, genreName: null, themeIds: [], gameTagIds: [], gameTagsFixed: [], playlistCount: 99, createdAt: new Date(), updatedAt: new Date(),
  });
  return ref.id;
}

async function search(page: Page, path: string, label: string, keyword: string) {
  await page.goto(path);
  // モバイルでは検索条件がアコーディオンに畳まれている
  const toggle = page.locator('button[aria-expanded]').filter({ hasText: '検索条件' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByLabel(label).filter({ visible: true }).fill(keyword);
}

test('§10.7 再生リストを探すには掲載中だけが出る。掲載していないものも URL からは開ける', async ({ guestPage }) => {
  const channelName = uniqueText('チャンネル');
  const channelId = await seedChannel(channelName);
  const listed = await seedPlaylist({ channelId, channelName, listingStatus: 'listed' });
  const unconfirmed = await seedPlaylist({ channelId, channelName, listingStatus: 'unconfirmed' });
  const nonGame = await seedPlaylist({ channelId, channelName, listingStatus: 'non_game' });
  const off = await seedPlaylist({ channelId, channelName, listingStatus: 'channel_off' });
  try {
    await search(guestPage, '/playlists', 'ゲームタイトル・チャンネル名で検索', channelName);
    await expect(guestPage.locator(`a[href="/playlists/${listed.id}"]`).first()).toBeVisible({ timeout: 30_000 });
    for (const hidden of [unconfirmed, nonGame, off]) await expect(guestPage.locator(`a[href="/playlists/${hidden.id}"]`)).toHaveCount(0);

    // 掲載していない再生リストも URL から開ける（精査 Q2=A）
    await guestPage.goto(`/playlists/${unconfirmed.id}`);
    await expect(guestPage.getByRole('heading', { name: unconfirmed.title }).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(guestPage.getByText('問題が発生しました')).toHaveCount(0);
  } finally {
    await Promise.all([listed, unconfirmed, nonGame, off].map((p) => e2eDb().collection('playlists').doc(p.id).delete()));
    await e2eDb().collection('channels').doc(channelId).delete();
  }
});

test('§9.1 チャンネルを探すには、掲載中の再生リストがあるチャンネルだけが出て、数も掲載中だけで数える', async ({ guestPage }) => {
  const shownName = uniqueText('掲載チャンネル');
  const hiddenName = uniqueText('確認待ちだけのチャンネル');
  const shownId = await seedChannel(shownName);
  const hiddenId = await seedChannel(hiddenName);
  const a = await seedPlaylist({ channelId: shownId, channelName: shownName, listingStatus: 'listed' });
  const b = await seedPlaylist({ channelId: shownId, channelName: shownName, listingStatus: 'unconfirmed' });
  const c = await seedPlaylist({ channelId: hiddenId, channelName: hiddenName, listingStatus: 'unconfirmed' });
  try {
    await search(guestPage, '/channels', 'チャンネル名で検索', '[E2E]');
    const shown = guestPage.locator(`a[href="/channels/${shownId}"]`).first();
    await expect(shown).toBeVisible({ timeout: 30_000 });
    await expect(shown).toContainText('1 再生リスト');
    await expect(guestPage.locator(`a[href="/channels/${hiddenId}"]`)).toHaveCount(0);
  } finally {
    await Promise.all([a, b, c].map((p) => e2eDb().collection('playlists').doc(p.id).delete()));
    await Promise.all([shownId, hiddenId].map((id) => e2eDb().collection('channels').doc(id).delete()));
  }
});

test('§8.1 チャンネル詳細: 掲載中が0件でも確認待ちなら開ける（空状態）。再生リストがすべて channel_off なら 404', async ({ guestPage }) => {
  const waitingName = uniqueText('確認待ちのチャンネル');
  const offName = uniqueText('掲載から外したチャンネル');
  const waitingId = await seedChannel(waitingName);
  const offId = await seedChannel(offName);
  const a = await seedPlaylist({ channelId: waitingId, channelName: waitingName, listingStatus: 'unconfirmed' });
  const b = await seedPlaylist({ channelId: offId, channelName: offName, listingStatus: 'channel_off' });
  try {
    await guestPage.goto(`/channels/${waitingId}`);
    await expect(guestPage.getByRole('heading', { name: waitingName })).toBeVisible({ timeout: 30_000 });
    await expect(guestPage.getByText('0 再生リスト')).toBeVisible();

    await guestPage.goto(`/channels/${offId}`);
    await expect(guestPage.getByText('ページが見つかりません').first()).toBeVisible({ timeout: 30_000 });
    await expect(guestPage.getByRole('heading', { name: offName })).toHaveCount(0);
  } finally {
    await Promise.all([a, b].map((p) => e2eDb().collection('playlists').doc(p.id).delete()));
    await Promise.all([waitingId, offId].map((id) => e2eDb().collection('channels').doc(id).delete()));
  }
});

test('§3.3 ゲームタイトル一覧の再生リスト数は掲載中だけで数える（games.playlistCount の値に頼らない）', async ({ guestPage }) => {
  const gameTitle = uniqueText('件数のゲーム');
  const gameId = await seedGame(gameTitle);
  const channelName = uniqueText('チャンネル');
  const channelId = await seedChannel(channelName);
  const a = await seedPlaylist({ channelId, channelName, listingStatus: 'listed', gameId, gameName: gameTitle });
  const b = await seedPlaylist({ channelId, channelName, listingStatus: 'excluded', gameId, gameName: gameTitle });
  try {
    await guestPage.goto('/games');
    const toggle = guestPage.locator('button[aria-expanded]').filter({ hasText: '検索条件' });
    if (await toggle.isVisible()) await toggle.click();
    await guestPage.getByLabel('ゲームタイトル名で検索').filter({ visible: true }).fill(gameTitle);
    const card = guestPage.locator(`a[href="/games/${gameId}"]`).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('1 再生リスト');
  } finally {
    await Promise.all([a, b].map((p) => e2eDb().collection('playlists').doc(p.id).delete()));
    await e2eDb().collection('games').doc(gameId).delete();
    await e2eDb().collection('channels').doc(channelId).delete();
  }
});
