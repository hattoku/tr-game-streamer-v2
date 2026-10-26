// 収集候補のまとめて承認（推定なしの候補）。管理 AI運営者向け収集候補レビューUI仕様書 v2.1 §3.4・§3.5・§4.2・§4.3 の確認項目。
// 候補は Admin SDK で直接作る（YouTube に無い再生リストID）。承認すると、ゲームタイトルを用意したあと
// 再生リストの取得で「削除されていた」になり、候補は自動で却下される（§4.2）。これを使って、
// 実在の再生リストを登録せずにゲームタイトルの用意（§4.3）だけを確かめる。
// 作ったデータ（再生リストタイトル・ゲーム名が [E2E] で始まる）は e2e/support/cleanup.ts が消す。
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { uniqueText } from './support/env';
import { e2eDb } from './support/cleanup';

function randomId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** 推定なしの収集候補を作る。同じ channelTitle の候補は一覧で1つのチャンネルにまとまる */
async function seedCandidate(params: { channelTitle: string; explorationChannelId: string; gameQuery: string }): Promise<string> {
  const playlistId = randomId('PLE2E');
  await e2eDb()
    .collection('collection_candidates')
    .doc(playlistId)
    .set({
      playlistId,
      playlistTitle: uniqueText('収集候補'),
      channelId: 'UCE2E',
      channelTitle: params.channelTitle,
      explorationChannelId: params.explorationChannelId,
      thumbnailUrl: '',
      videoCount: 12,
      playlistPublishedAt: new Date(),
      guessedGameId: null,
      guessedGameTitle: null,
      gameQuery: params.gameQuery,
      titleTagIds: [],
      source: 'channel',
      status: 'pending',
      collectedAt: new Date(),
      reviewedAt: null,
      reviewedBy: null,
      reviewComment: null,
      registeredPlaylistId: null,
    });
  return playlistId;
}

async function gamesTitled(title: string) {
  return (await e2eDb().collection('games').where('title', '==', title).get()).docs;
}

function section(page: Page, channelTitle: string) {
  return page.locator('section').filter({ hasText: channelTitle });
}

async function approveAll(page: Page, channelTitle: string) {
  await section(page, channelTitle).getByLabel('全選択').check();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '選択を承認して登録' }).click();
}

test('§3.4・§3.5 推定なしの候補には、gameQuery を入れた新規のゲーム名欄が出て、そのまま選べる', async ({ adminPage }) => {
  const channelTitle = uniqueText('チャンネル');
  const gameQuery = uniqueText('ゲーム名');
  const playlistId = await seedCandidate({ channelTitle, explorationChannelId: randomId('e2e-ch-'), gameQuery });

  await adminPage.goto('/admin/collection');
  const group = section(adminPage, channelTitle);
  const row = group.getByRole('listitem');
  await expect(row).toContainText('新規');
  const input = row.getByRole('textbox');
  await expect(input).toHaveValue(gameQuery);
  await expect(row.getByRole('button', { name: '既存から選ぶ' })).toBeVisible();

  // 推定なしでも全選択の対象になる
  await group.getByLabel('全選択').check();
  const checkbox = row.getByRole('checkbox');
  await expect(checkbox).toBeChecked();
  await expect(adminPage.getByText('選択中 1件')).toBeVisible();

  // ゲーム名を空にすると選べなくなる（§4.2）
  await input.fill('');
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toBeDisabled();

  // 書き換えると、また選べる
  await input.fill(`${gameQuery} 改`);
  await expect(checkbox).toBeEnabled();

  const snap = await e2eDb().collection('collection_candidates').doc(playlistId).get();
  expect(snap.data()!.status).toBe('pending');
});

test('§4.3 新規のゲーム名で承認しても、再生リストが1件も登録できなければゲームタイトルは残らない', async ({ adminPage }) => {
  test.setTimeout(120_000);
  const channelTitle = uniqueText('チャンネル');
  const explorationChannelId = randomId('e2e-ch-');
  const gameTitle = uniqueText('新しいゲーム');
  const ids = [
    await seedCandidate({ channelTitle, explorationChannelId, gameQuery: gameTitle }),
    await seedCandidate({ channelTitle, explorationChannelId, gameQuery: gameTitle }),
  ];

  await adminPage.goto('/admin/collection');
  await expect(section(adminPage, channelTitle).getByRole('listitem')).toHaveCount(2);
  // 確認ダイアログに、新しく登録するゲーム名が（同じ名前は1件にまとめて）出る
  let dialogMessage = '';
  adminPage.once('dialog', (dialog) => {
    dialogMessage = dialog.message();
    dialog.accept();
  });
  await section(adminPage, channelTitle).getByLabel('全選択').check();
  await adminPage.getByRole('button', { name: '選択を承認して登録' }).click();

  // 再生リストは YouTube に無いので2件とも自動で却下され（§4.2）、用意したゲームタイトルは消される
  await expect(adminPage.getByText(/(^|[^0-9])0件を登録しました（失敗 2件）/).first()).toBeVisible({ timeout: 60_000 });
  expect(dialogMessage).toContain('2件を登録します');
  expect(dialogMessage).toContain(`（1件）`);
  expect(dialogMessage).toContain(`・${gameTitle}`);
  await expect(adminPage.getByText('ゲームタイトルを1件追加')).toHaveCount(0);
  await expect(section(adminPage, channelTitle)).toHaveCount(0);

  expect(await gamesTitled(gameTitle)).toHaveLength(0);
  for (const id of ids) {
    const snap = await e2eDb().collection('collection_candidates').doc(id).get();
    expect(snap.data()!.status).toBe('rejected');
    expect(snap.data()!.reviewComment).toBe('playlist_not_found');
  }
});

test('§4.3-1 既存のゲームタイトルのタイトル・別名と正規化して一致すれば、新しく作らずそれを使う', async ({ adminPage }) => {
  test.setTimeout(120_000);
  const base = uniqueText('Existing Game');
  // 既存のゲーム（[E2E] Existing Game 123-abc）と、大文字小文字・空白だけが違う名前
  const variant = base.toLowerCase().replace(/ /g, '');
  const alias = uniqueText('別名');
  const gameRef = e2eDb().collection('games').doc();
  await gameRef.set({ title: base, aliases: [alias], platforms: [], themeIds: [], genreId: null, genreName: null, playlistCount: 0, createdAt: new Date(), updatedAt: new Date() });

  const channelTitle = uniqueText('チャンネル');
  const explorationChannelId = randomId('e2e-ch-');
  await seedCandidate({ channelTitle, explorationChannelId, gameQuery: variant });
  await seedCandidate({ channelTitle, explorationChannelId, gameQuery: alias });

  await adminPage.goto('/admin/collection');
  // 画面の再推定は再生リストタイトルで行うため、この候補は推定なし（新規の欄）のまま
  await expect(section(adminPage, channelTitle).getByRole('textbox')).toHaveCount(2);
  await approveAll(adminPage, channelTitle);

  await expect(adminPage.getByText(/(^|[^0-9])0件を登録しました（失敗 2件）/).first()).toBeVisible({ timeout: 60_000 });
  expect(await gamesTitled(variant)).toHaveLength(0);
  expect(await gamesTitled(alias)).toHaveLength(0);
  // 既存のゲームは消されない（このリクエストで新規登録したものだけが消える対象）
  expect((await gameRef.get()).exists).toBe(true);
});
