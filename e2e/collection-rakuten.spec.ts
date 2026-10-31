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
  // 確認用に、商品名は楽天ブックスの商品ページを別タブで開くリンク（v2.3）
  const itemLink = line.getByRole('link', { name: /を楽天ブックスで開く$/ });
  await expect(itemLink).toHaveAttribute('href', /^https:\/\/books\.rakuten\.co\.jp\//);
  await expect(itemLink).toHaveAttribute('target', '_blank');

  const saved = (await e2eDb().collection('collection_candidates').doc(playlistId).get()).data()!.rakutenSearch;
  expect(saved.title).toBe('野狗子: Slitterhead');
  expect(saved.items.length).toBeGreaterThan(0);
  expect(saved.items.every((i: { jan: string; itemUrl: string }) => i.jan && i.itemUrl)).toBe(true);

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

test('§3.3・§3.7 楽天の状態で絞り込め、各絞り込みに件数が出る。自動検索が終わると順番待ちは0件になる', async ({ adminPage }) => {
  test.setTimeout(120_000);
  const channelTitle = uniqueText('チャンネル');
  const explorationChannelId = randomId('e2e-ch-');
  const matchedName = '野狗子: Slitterhead';
  await seedCandidate({ channelTitle, explorationChannelId, gameQuery: matchedName, rakutenSearch: { title: matchedName, query: matchedName, items: [SLITTERHEAD] } });
  const unmatchedName = uniqueText('一致しないゲーム');
  await seedCandidate({ channelTitle, explorationChannelId, gameQuery: unmatchedName, rakutenSearch: { title: unmatchedName, query: '野狗子', items: [SLITTERHEAD] } });
  const zeroName = uniqueText('見つからないゲーム');
  await seedCandidate({ channelTitle, explorationChannelId, gameQuery: zeroName, rakutenSearch: { title: zeroName, query: zeroName, items: [] } });
  // 検索していない候補（自動検索で0件になる）
  await seedCandidate({ channelTitle, explorationChannelId, gameQuery: uniqueText('未検索のゲーム') });

  await adminPage.goto('/admin/collection');
  await filterChannel(adminPage, channelTitle);
  await expect(adminPage.getByRole('button', { name: 'チャンネルで絞り込み' })).toContainText(`${channelTitle}（4）`);
  await expect(adminPage.getByRole('button', { name: 'ゲームで絞り込み' })).toContainText('すべて（4）');

  // 自動検索が終わると、順番待ちは0件、楽天なし・見つからないは2件
  const rakutenFilter = adminPage.getByRole('button', { name: '楽天の商品で絞り込み' });
  await expect(section(adminPage, channelTitle).getByTestId('rakuten-line').filter({ hasText: '自動検索の順番待ち' })).toHaveCount(0, { timeout: 60_000 });
  await rakutenFilter.click();
  await expect(adminPage.getByRole('menuitemradio', { name: '商品あり（1）' })).toBeVisible();
  await expect(adminPage.getByRole('menuitemradio', { name: '一致なし（候補あり）（1）' })).toBeVisible();
  await expect(adminPage.getByRole('menuitemradio', { name: '楽天なし・見つからない（2）' })).toBeVisible();
  await expect(adminPage.getByRole('menuitemradio', { name: '自動検索の順番待ち（0）' })).toBeVisible();
  await adminPage.getByRole('menuitemradio', { name: /^商品あり/ }).click();

  const rows = section(adminPage, channelTitle).getByRole('listitem');
  await expect(rows).toHaveCount(1);
  await expect(rows.getByTestId('rakuten-line')).toContainText('野狗子: Slitterhead');
  await expect(rakutenFilter).toContainText('商品あり（1）');
});

test('§1.1 コンテンツ収集の2つの画面は、上の大きなタブで切り替えられる', async ({ adminPage }) => {
  await adminPage.goto('/admin/collection');
  const nav = adminPage.getByRole('navigation', { name: 'コンテンツ収集の画面' });
  await expect(nav.getByRole('link', { name: /収集候補/ })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: /探索対象チャンネル/ }).click();
  await expect(adminPage).toHaveURL(/\/admin\/collection\/channels$/);
  await expect(adminPage.getByRole('heading', { name: '探索対象チャンネル', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: /探索対象チャンネル/ })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: /収集候補/ }).click();
  await expect(adminPage).toHaveURL(/\/admin\/collection$/);
});

test('§3.8 「動画一覧を見る（YouTube）」とサムネイルは、YouTube の再生リストのページを別タブで開くリンク', async ({ adminPage }) => {
  const channelTitle = uniqueText('チャンネル');
  const playlistId = await seedCandidate({ channelTitle, explorationChannelId: randomId('e2e-ch-'), gameQuery: uniqueText('動画一覧のゲーム') });

  await adminPage.goto('/admin/collection');
  await filterChannel(adminPage, channelTitle);
  const group = section(adminPage, channelTitle);
  const url = `https://www.youtube.com/playlist?list=${playlistId}`;
  for (const link of [group.getByRole('link', { name: /の動画一覧をYouTubeで見る$/ }), group.getByRole('link', { name: /をYouTubeで開く$/ })]) {
    await expect(link).toHaveAttribute('href', url);
    await expect(link).toHaveAttribute('target', '_blank');
  }
});

test('§3.7 楽天ブックスの「ゲーム」の下でも、おもちゃ・その他（グッズ・周辺機器）の商品は候補に出さない', async ({ adminPage }) => {
  test.setTimeout(120_000);
  const channelTitle = uniqueText('チャンネル');
  // 「ポケモンSV」は以前、ピカチュウの水筒（おもちゃ）だけがヒットしていた
  const playlistId = await seedCandidate({ channelTitle, explorationChannelId: randomId('e2e-ch-'), gameQuery: 'ポケモンSV' });

  await adminPage.goto('/admin/collection');
  await filterChannel(adminPage, channelTitle);
  const line = rakutenLine(adminPage, channelTitle);
  await expect(line).not.toContainText(/自動検索の順番待ち|検索中…/, { timeout: 60_000 });
  const saved = (await e2eDb().collection('collection_candidates').doc(playlistId).get()).data()!.rakutenSearch;
  expect(saved.items.filter((i: { hardware: string }) => i.hardware === '玩具')).toEqual([]);
  await expect(line).not.toContainText('水筒');
});
