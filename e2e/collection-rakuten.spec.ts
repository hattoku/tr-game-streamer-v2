// 収集候補の新規ゲームに結び付ける楽天ブックスの商品を、承認前に選ぶ。
// 管理 AI運営者向け収集候補レビューUI仕様書 v2.2 §3.7・§4.3 の確認項目。
// 自動検索は実際の楽天ブックスAPIを呼ぶ（stg の未処理の候補もあるため、チャンネルで絞り込んでから待つ）。
// 承認は YouTube に無い再生リストIDで行うので、候補は自動で却下され、用意したゲームタイトルは消える（§4.3）。
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { uniqueText } from './support/env';
import { db as e2eDb } from './support/cleanup';
import { randomId, section, seedCandidate } from './support/collection';

const SLITTERHEAD = {
  jan: '4595989961023',
  title: '野狗子: Slitterhead',
  hardware: 'PS5',
  imageUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/1023/4595989961023.jpg?_ex=200x200',
  salesDate: '2024年11月08日',
};
const SLITTERHEAD_MANIAC = {
  jan: '4595989961030',
  title: '野狗子: Slitterhead マニアックエディション',
  hardware: 'PS5',
  imageUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/1030/4595989961030.jpg?_ex=200x200',
  salesDate: '2024年11月08日',
};

async function filterChannel(page: Page, channelTitle: string) {
  await page.getByRole('button', { name: 'チャンネルで絞り込み' }).click();
  await page.getByRole('menuitemradio', { name: channelTitle }).click();
}

function rakutenLine(page: Page, channelTitle: string) {
  return section(page, channelTitle).getByTestId('rakuten-line');
}

test('§3.7 新規のゲーム名は表示すると楽天ブックスを自動で検索し、名前が一致する商品を選んだ状態で出す（結果は候補に保存）', async ({ adminPage }) => {
  test.setTimeout(120_000);
  const channelTitle = uniqueText('チャンネル');
  const playlistId = await seedCandidate({ channelTitle, explorationChannelId: randomId('e2e-ch-'), gameQuery: '野狗子: Slitterhead' });

  await adminPage.goto('/admin/collection');
  await filterChannel(adminPage, channelTitle);
  const line = rakutenLine(adminPage, channelTitle);
  await expect(line).toContainText('野狗子: Slitterhead', { timeout: 60_000 });
  await expect(line).toContainText('PS5');
  await expect(line.getByRole('button', { name: /選び直す$/ })).toBeVisible();

  const saved = (await e2eDb().collection('collection_candidates').doc(playlistId).get()).data()!.rakutenSearch;
  expect(saved.title).toBe('野狗子: Slitterhead');
  expect(saved.items.length).toBeGreaterThan(0);
  expect(saved.items.every((i: { jan: string }) => i.jan)).toBe(true);

  // 検索した後にゲーム名を書き換えると、古い結果は使わず、承認時に新しい名前で探す
  await section(adminPage, channelTitle).getByRole('textbox').fill('野狗子 改');
  await expect(line).toContainText('ゲーム名を変えました（承認時にこの名前で探します）');
  await expect(line.getByRole('button', { name: /探し直す$/ })).toBeVisible();
});

test('§3.7 0件なら末尾の略称を外して探し直す。名前が一致しなければ候補件数を出し、選ぶと商品名をゲーム名にできる', async ({ adminPage }) => {
  test.setTimeout(120_000);
  const channelTitle = uniqueText('チャンネル');
  const playlistId = await seedCandidate({ channelTitle, explorationChannelId: randomId('e2e-ch-'), gameQuery: 'デッドライジングDR' });

  await adminPage.goto('/admin/collection');
  await filterChannel(adminPage, channelTitle);
  const line = rakutenLine(adminPage, channelTitle);
  await expect(line).toContainText(/名前が一致する商品なし（候補\d+件。このままなら名前だけで登録）/, { timeout: 60_000 });
  const saved = (await e2eDb().collection('collection_candidates').doc(playlistId).get()).data()!.rakutenSearch;
  expect(saved.query).toBe('デッドライジング');

  await line.getByRole('button', { name: /候補から選ぶ$/ }).click();
  const dialog = adminPage.getByRole('dialog', { name: '楽天ブックスの商品を選ぶ' });
  await expect(dialog.getByRole('textbox', { name: '楽天ブックスの検索語' })).toHaveValue('デッドライジング');
  const first = dialog.getByRole('list', { name: '楽天ブックスの検索結果' }).getByRole('button').first();
  const firstTitle = (await first.locator('span.line-clamp-2').textContent())!.trim();
  await first.click();
  await expect(dialog).toBeHidden();
  await expect(line).toContainText(firstTitle);

  // 選んだ商品名がゲーム名と違うので、商品名をゲーム名にできる
  const useName = line.getByRole('button', { name: /^ゲーム名を「.+」にする$/ });
  await expect(useName).toBeVisible();
  await useName.click();
  const input = section(adminPage, channelTitle).getByRole('textbox');
  await expect(input).not.toHaveValue('デッドライジングDR');
  await expect(input).toHaveValue(new RegExp(`^${firstTitle.slice(0, 4)}`));
  await expect(useName).toHaveCount(0);
});

test('§3.7 見つからないときは「見つかりませんでした」を出し、検索語を変えて探し直せる', async ({ adminPage }) => {
  test.setTimeout(120_000);
  const channelTitle = uniqueText('チャンネル');
  const playlistId = await seedCandidate({ channelTitle, explorationChannelId: randomId('e2e-ch-'), gameQuery: uniqueText('存在しないゲーム') });

  await adminPage.goto('/admin/collection');
  await filterChannel(adminPage, channelTitle);
  const line = rakutenLine(adminPage, channelTitle);
  await expect(line).toContainText('見つかりませんでした（名前だけで登録）', { timeout: 60_000 });

  await line.getByRole('button', { name: /探し直す$/ }).click();
  const dialog = adminPage.getByRole('dialog', { name: '楽天ブックスの商品を選ぶ' });
  await dialog.getByRole('textbox', { name: '楽天ブックスの検索語' }).fill('野狗子');
  await dialog.getByRole('button', { name: '検索' }).click();
  await expect(dialog.getByRole('list', { name: '楽天ブックスの検索結果' }).getByRole('button').first()).toContainText('野狗子', { timeout: 30_000 });
  // 探し直した結果は候補に保存し直す
  await expect.poll(async () => (await e2eDb().collection('collection_candidates').doc(playlistId).get()).data()!.rakutenSearch.query).toBe('野狗子');
});

test('§3.7・§4.3 承認では、選んだ商品のJAN・楽天なし（null）を送り、確認ダイアログに楽天の商品を添える', async ({ adminPage }) => {
  test.setTimeout(120_000);
  const channelTitle = uniqueText('チャンネル');
  const explorationChannelId = randomId('e2e-ch-');
  // 検索済みの結果（ゲーム名で検索し、検索語「野狗子」で見つかった）を保存しておく
  const rakutenSearchFor = (title: string) => ({ title, query: '野狗子', items: [SLITTERHEAD, SLITTERHEAD_MANIAC] });
  const pickedName = uniqueText('選んだゲーム');
  const noneName = uniqueText('楽天なしのゲーム');
  const picked = await seedCandidate({ channelTitle, explorationChannelId, gameQuery: pickedName, rakutenSearch: rakutenSearchFor(pickedName) });
  const none = await seedCandidate({ channelTitle, explorationChannelId, gameQuery: noneName, rakutenSearch: rakutenSearchFor(noneName) });

  await adminPage.goto('/admin/collection');
  await filterChannel(adminPage, channelTitle);
  const rows = section(adminPage, channelTitle).getByRole('listitem');
  const pickedRow = rows.filter({ has: adminPage.locator(`input[value="${pickedName}"]`) });
  const noneRow = rows.filter({ has: adminPage.locator(`input[value="${noneName}"]`) });

  // 名前が一致しないので、どちらも未選択（候補2件）
  await expect(pickedRow.getByTestId('rakuten-line')).toContainText('名前が一致する商品なし（候補2件。');
  await pickedRow.getByRole('button', { name: /候補から選ぶ$/ }).click();
  const dialog = adminPage.getByRole('dialog', { name: '楽天ブックスの商品を選ぶ' });
  await dialog.getByRole('button', { name: /マニアックエディション/ }).click();
  await expect(pickedRow.getByTestId('rakuten-line')).toContainText('マニアックエディション');

  await noneRow.getByRole('button', { name: /候補から選ぶ$/ }).click();
  await dialog.getByRole('button', { name: '楽天なしで登録する' }).click();
  await expect(noneRow.getByTestId('rakuten-line')).toContainText('使わない（名前だけで登録）');

  let dialogMessage = '';
  adminPage.once('dialog', (d) => {
    dialogMessage = d.message();
    d.accept();
  });
  const requestPromise = adminPage.waitForRequest(
    (r) => r.url().includes('/api/admin/collection/candidates') && r.method() === 'POST' && (r.postData() ?? '').includes('"approve"'),
  );
  await section(adminPage, channelTitle).getByLabel('全選択').check();
  await adminPage.getByRole('button', { name: '選択を承認して登録' }).click();
  const body = JSON.parse((await requestPromise).postData()!);
  const items = body.items as Array<{ playlistId: string; rakutenJan?: string | null }>;
  expect(items.find((i) => i.playlistId === picked)!.rakutenJan).toBe(SLITTERHEAD_MANIAC.jan);
  expect(items.find((i) => i.playlistId === none)!.rakutenJan).toBeNull();
  expect(dialogMessage).toContain(`・${pickedName}（楽天: ${SLITTERHEAD_MANIAC.title}）`);
  expect(dialogMessage).toContain(`・${noneName}（楽天なし）`);

  // 承認APIは rakutenJan を受け付け、YouTube に無い再生リストは却下する（ゲームタイトルは残らない）
  await expect(adminPage.getByText(/(^|[^0-9])0件を登録しました（失敗 2件）/).first()).toBeVisible({ timeout: 60_000 });
  for (const id of [picked, none]) {
    expect((await e2eDb().collection('collection_candidates').doc(id).get()).data()!.status).toBe('rejected');
  }
});
