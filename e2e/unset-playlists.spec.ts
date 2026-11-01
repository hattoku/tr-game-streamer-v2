// ゲーム未設定の画面（収集候補レビューUI仕様書 v2.5 §6.5）の確認項目。
// ゲーム未設定の再生リスト（gameId=null）とゲームタイトルは Admin SDK で直接作り、終了時に自分で消す（[E2E] で始まる名前）。
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { uniqueText } from './support/env';
import { db as e2eDb } from './support/cleanup';
import { randomId } from './support/collection';

async function seedUnsetPlaylist(hint: string | null, titleOverride?: string) {
  const id = randomId('PLE2E');
  const title = titleOverride ?? uniqueText('未設定の再生リスト');
  await e2eDb().collection('playlists').doc(id).set({
    title, thumbnailUrl: '', channelId: 'UCE2E', channelName: uniqueText('チャンネル'), channelIconUrl: '',
    gameId: null, gameName: '', gameGenreIds: [], gameHint: hint, gameSetBy: null, gameSetAt: null,
    videoCount: 0, latestVideoPublishedAt: null, registeredAt: new Date(), registeredBy: 'e2e', proposedBy: null,
    isPublic: true, listingStatus: 'listed', score: null, reviewCount: 0, mylistCount: 0, playlistTagIds: [], playlistTagsFixed: [],
    referenceUrl: '', lastFetchedAt: null,
  });
  return { id, title };
}

async function seedGame(title: string, aliases: string[] = []) {
  const ref = e2eDb().collection('games').doc();
  await ref.set({
    title, aliases, packageImageUrl: null, rakutenUrl: null, description: '', isAiGeneratedDescription: false, platforms: [],
    genreId: null, genreName: null, themeIds: [], gameTagIds: [], gameTagsFixed: [], playlistCount: 0, createdAt: new Date(), updatedAt: new Date(),
  });
  return ref.id;
}

async function cleanup(playlistId: string, gameId: string) {
  const changes = await e2eDb().collection('playlist_game_changes').where('playlistId', '==', playlistId).get();
  await Promise.all([...changes.docs.map((d) => d.ref.delete()), e2eDb().collection('playlists').doc(playlistId).delete(), e2eDb().collection('games').doc(gameId).delete()]);
}

async function row(page: Page, title: string) {
  await page.goto('/admin/collection/unset');
  return page.getByRole('listitem').filter({ hasText: title });
}

test('§6.5 ゲーム未設定の画面に一覧が出て、ゲームを選ぶと付き、履歴が残る', async ({ adminPage }) => {
  const gameTitle = uniqueText('手動で付けるゲーム');
  const gameId = await seedGame(gameTitle);
  const hint = uniqueText('まだ無いゲーム名');
  const { id, title } = await seedUnsetPlaylist(hint);
  try {
    const item = await row(adminPage, title);
    await expect(item).toContainText(hint);
    await expect(adminPage.getByRole('navigation', { name: 'コンテンツ収集の画面' })).toContainText('ゲーム未設定');

    await item.getByRole('button', { name: /ゲームを選ぶ/ }).click();
    await adminPage.getByRole('dialog').getByText(gameTitle).click();
    await expect(adminPage.getByText('ゲームを付けました').first()).toBeVisible();
    await expect(item).toHaveCount(0);

    const playlist = (await e2eDb().collection('playlists').doc(id).get()).data()!;
    expect(playlist.gameId).toBe(gameId);
    expect(playlist.gameName).toBe(gameTitle);
    expect(playlist.gameSetBy).toBe('admin');
    expect((await e2eDb().collection('games').doc(gameId).get()).data()!.playlistCount).toBe(1);
    const changes = await e2eDb().collection('playlist_game_changes').where('playlistId', '==', id).get();
    expect(changes.size).toBe(1);
    expect(changes.docs[0].data()).toMatchObject({ from: null, to: gameId, by: 'admin' });
  } finally {
    await cleanup(id, gameId);
  }
});

test('§6.5 ヒントが無い再生リストは名前にタイトルが含まれれば付くが、続編・番号違いは付かない', async ({ adminPage }) => {
  const gameTitle = uniqueText('ゲーム名照合');
  const gameId = await seedGame(gameTitle);
  const plain = await seedUnsetPlaylist(null, `${gameTitle} 実況 Part1`);
  const sequel = await seedUnsetPlaylist(null, `${gameTitle}2 実況`);
  try {
    await row(adminPage, plain.title);
    await adminPage.getByRole('button', { name: 'いますぐ照合' }).click();
    await expect(adminPage.getByText(/件を照合し、\d+件にゲームを付けました/).first()).toBeVisible({ timeout: 30_000 });
    expect((await e2eDb().collection('playlists').doc(plain.id).get()).data()!.gameId).toBe(gameId);
    expect((await e2eDb().collection('playlists').doc(sequel.id).get()).data()!.gameId).toBeNull();
  } finally {
    await cleanup(plain.id, gameId);
    await cleanup(sequel.id, gameId);
  }
});

test('§6.5 いますぐ照合で、ヒントがタイトル・別名と完全一致する再生リストにだけゲームが付く', async ({ adminPage }) => {
  const gameTitle = uniqueText('照合するゲーム');
  const alias = uniqueText('エイリアス名');
  const gameId = await seedGame(gameTitle, [alias]);
  const matched = await seedUnsetPlaylist(alias);
  const unmatched = await seedUnsetPlaylist(`${alias} 続編`);
  try {
    await row(adminPage, matched.title);
    await adminPage.getByRole('button', { name: 'いますぐ照合' }).click();
    await expect(adminPage.getByText(/件を照合し、\d+件にゲームを付けました/).first()).toBeVisible({ timeout: 30_000 });

    const a = (await e2eDb().collection('playlists').doc(matched.id).get()).data()!;
    expect(a.gameId).toBe(gameId);
    expect(a.gameSetBy).toBe('auto');
    const b = (await e2eDb().collection('playlists').doc(unmatched.id).get()).data()!;
    expect(b.gameId).toBeNull();
    expect((await e2eDb().collection('games').doc(gameId).get()).data()!.playlistCount).toBe(1);
  } finally {
    await cleanup(matched.id, gameId);
    await cleanup(unmatched.id, gameId);
  }
});
