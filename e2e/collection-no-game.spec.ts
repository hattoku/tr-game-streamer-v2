// ゲーム未設定で登録（収集候補レビューUI仕様書 v2.4 §3.9・§4.1〜§4.3、再生リストを探す仕様書 v1.10 §4.2）の確認項目。
// 候補は Admin SDK で直接作る（YouTube に無い再生リストID）ので、承認は「削除されていた」で自動却下になる（§4.2）。
// ゲーム未設定の再生リスト本体（gameId=null）は Admin SDK で直接作り、画面の崩れと gameHint 検索を確かめる。
// タイトル・ゲーム名が [E2E] で始まるデータは、再生リストはテスト内で、候補・ゲームは e2e/support/cleanup.ts が消す。
import { expect, test } from './support/fixtures';
import { uniqueText } from './support/env';
import { db as e2eDb } from './support/cleanup';
import { gamesTitled, randomId, section, seedCandidate } from './support/collection';

test('§3.9 ゲーム未設定にすると名前欄・楽天欄が畳まれ、絞り込みと件数に出て、戻せる', async ({ adminPage }) => {
  const channelTitle = uniqueText('チャンネル');
  const gameQuery = uniqueText('英語名');
  await seedCandidate({ channelTitle, explorationChannelId: randomId('e2e-ch-'), gameQuery });

  await adminPage.goto('/admin/collection');
  const group = section(adminPage, channelTitle);
  const row = group.getByRole('listitem');
  await expect(row).toContainText('新しく登録する');

  await row.getByRole('button', { name: /ゲーム未設定にする/ }).click();
  await expect(row).toContainText('ゲーム未設定で登録');
  await expect(row.getByTestId('no-game-panel')).toContainText('あとでゲームタイトルが登録されたときに紐づけます');
  await expect(row.getByTestId('no-game-panel')).toContainText(gameQuery);
  await expect(row.getByRole('textbox')).toHaveCount(0);
  await expect(row.getByRole('checkbox')).toBeChecked();

  // 絞り込みに「ゲーム未設定で登録（N）」が出て、行がそちらへ移る
  await expect(adminPage.getByText(/ゲーム未設定で登録（\d+）/).first()).toBeVisible();

  // 元に戻すと、名前欄が戻る
  await row.getByRole('button', { name: /新しく登録するに戻す/ }).click();
  await expect(row.getByRole('textbox')).toHaveValue(gameQuery);
});

test('§4.1 ゲーム未設定で承認すると、ダイアログに件数が出て、ゲームタイトルは作られない', async ({ adminPage }) => {
  test.setTimeout(120_000);
  const channelTitle = uniqueText('チャンネル');
  const gameQuery = uniqueText('英語名');
  const playlistId = await seedCandidate({ channelTitle, explorationChannelId: randomId('e2e-ch-'), gameQuery });

  await adminPage.goto('/admin/collection');
  const group = section(adminPage, channelTitle);
  await group.getByRole('listitem').getByRole('button', { name: /ゲーム未設定にする/ }).click();

  let dialogMessage = '';
  adminPage.once('dialog', (dialog) => {
    dialogMessage = dialog.message();
    dialog.accept();
  });
  await adminPage.getByRole('button', { name: '選択を承認して登録' }).click();
  await expect(adminPage.getByText(/(^|[^0-9])0件を登録しました（失敗 1件）/).first()).toBeVisible({ timeout: 60_000 });

  expect(dialogMessage).toContain('1件を登録します');
  expect(dialogMessage).toContain('ゲーム未設定で登録するもの: 1件');
  expect(dialogMessage).not.toContain('新しく登録するゲームタイトル');
  expect(await gamesTitled(gameQuery)).toHaveLength(0);
  const snap = await e2eDb().collection('collection_candidates').doc(playlistId).get();
  expect(snap.data()!.status).toBe('rejected');
});

test('§4.1 一括の「選択をゲーム未設定にする」で、選んだ推定なしの候補すべてが未設定になる', async ({ adminPage }) => {
  const channelTitle = uniqueText('チャンネル');
  const explorationChannelId = randomId('e2e-ch-');
  await seedCandidate({ channelTitle, explorationChannelId, gameQuery: uniqueText('A') });
  await seedCandidate({ channelTitle, explorationChannelId, gameQuery: uniqueText('B') });

  await adminPage.goto('/admin/collection');
  const group = section(adminPage, channelTitle);
  await expect(group.getByRole('listitem')).toHaveCount(2);
  await group.getByLabel('全選択').check();
  await adminPage.getByRole('button', { name: '選択をゲーム未設定にする' }).click();
  await expect(group.getByTestId('no-game-panel')).toHaveCount(2);
});

test('v1.10 §4.2 ゲーム未設定の再生リストが一覧・詳細で崩れず、gameHint で検索できる', async ({ guestPage }) => {
  const hint = uniqueText('Hint Game');
  const playlistId = randomId('PLE2E');
  const ref = e2eDb().collection('playlists').doc(playlistId);
  await ref.set({
    title: uniqueText('未設定の再生リスト'),
    thumbnailUrl: '',
    channelId: 'UCE2E',
    channelName: uniqueText('チャンネル'),
    channelIconUrl: '',
    gameId: null,
    gameName: '',
    gameGenreIds: [],
    gameHint: hint,
    gameSetBy: null,
    gameSetAt: null,
    videoCount: 0,
    latestVideoPublishedAt: null,
    registeredAt: new Date(),
    registeredBy: 'e2e',
    proposedBy: null,
    isPublic: true,
    score: null,
    reviewCount: 0,
    mylistCount: 0,
    playlistTagIds: [],
    playlistTagsFixed: [],
    referenceUrl: '',
    lastFetchedAt: null,
  });
  try {
    await guestPage.goto('/playlists');
    await guestPage.getByLabel('ゲームタイトル・チャンネル名で検索').fill(hint);
    const card = guestPage.locator(`a[href="/playlists/${playlistId}"]`);
    await expect(card.first()).toBeVisible({ timeout: 30_000 });

    await card.first().click();
    await expect(guestPage).toHaveURL(new RegExp(`/playlists/${playlistId}$`));
    await expect(guestPage.locator('main')).toBeVisible();
    await expect(guestPage.getByText('問題が発生しました')).toHaveCount(0);
  } finally {
    await ref.delete();
  }
});
