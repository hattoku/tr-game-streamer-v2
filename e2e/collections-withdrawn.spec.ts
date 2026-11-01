// まとめ機能の取り下げ（2026-11-01、リブランディング段階2）。ページ 再生リスト まとめ機能仕様書 v2.0 冒頭の「外すもの」の表、
// ページ一覧仕様書 v2.0、共通 uiコンポーネント フロント 仕様書 v2.0 §2.4・§2.6・§2.7・§3.3、ページ top 仕様書 v2.0 §7.5、
// ページ 再生リスト詳細 仕様書 v1.14、ページ 再生リスト レビュー投稿機能 仕様書 v1.9.0、ページ マイリスト機能仕様書 v1.12 §5.2、
// ページ 設定 プロフィール仕様書 v1.8 の確認項目。データとコードは残している（表示しないことだけを確認する）。
import type { Page } from '@playwright/test';
import { captureIdToken, expect, test } from './support/fixtures';
import { testUserUid } from './support/watch-progress';

const CLOSED_PATHS = [
  '/collections',
  '/collections/new',
  '/collections/mine',
  '/collections/saved',
  '/collections/e2e-dummy',
  '/collections/e2e-dummy/edit',
];

/** まとめのページへのリンクが1つも無いこと（ヘッダー・フッター・さがすタブ・本文のすべて） */
async function expectNoCollectionsLinks(page: Page) {
  await expect(page.locator('a[href="/collections"], a[href^="/collections/"]')).toHaveCount(0);
}

/** 一覧から再生リスト詳細の URL を1つ取る（データが無い環境では null） */
async function firstPlaylistHref(page: Page): Promise<string | null> {
  await page.goto('/playlists');
  const link = page.locator('main a[href^="/playlists/"]:not([href="/playlists/new"]):not([href="/playlists/proposals"]):visible').first();
  const found = await link.waitFor({ timeout: 15_000 }).then(
    () => true,
    () => false,
  );
  return found ? link.getAttribute('href') : null;
}

test.describe('まとめのページは開けない（ページ一覧仕様書 v2.0：404）', () => {
  for (const path of CLOSED_PATHS) {
    test(`${path} は 404`, async ({ guestPage }) => {
      const response = await guestPage.goto(path);
      expect(response?.status(), `${path} のステータス`).toBe(404);
      await expect(guestPage.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible();
    });
  }

  test('ログイン中でも /collections/mine・/collections/saved は 404', async ({ userPage }) => {
    for (const path of ['/collections/mine', '/collections/saved']) {
      const response = await userPage.goto(path);
      expect(response?.status(), `${path} のステータス`).toBe(404);
      await expect(userPage.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible();
    }
  });
});

test.describe('まとめの API は読み書きせず 404（まとめ機能仕様書 v2.0）', () => {
  test('未ログインでも 404', async ({ guestPage }) => {
    const res = await guestPage.request.post('/api/collections', { data: { title: '[E2E] まとめ' } });
    expect(res.status()).toBe(404);
  });

  test('ログイン中の作成・保存一覧・保存も 404', async ({ userPage }) => {
    const token = await captureIdToken(userPage, '/contact/history');
    const headers = { Authorization: `Bearer ${token}` };
    const create = await userPage.request.post('/api/collections', {
      headers,
      data: { title: '[E2E] まとめ', description: '', visibility: 'private', showSpoiler: false, playlistIds: [] },
    });
    expect(create.status()).toBe(404);
    expect((await userPage.request.get('/api/collections/saved', { headers })).status()).toBe(404);
    expect((await userPage.request.post('/api/collections/e2e-dummy/save', { headers })).status()).toBe(404);
  });
});

test.describe('ナビゲーションからまとめを外す（UI仕様書 v2.0）', () => {
  test('TOP: 「新着のまとめ」が出ず、まとめへのリンクが無い（TOP仕様書 v2.0 §7.5）', async ({ guestPage }) => {
    await guestPage.goto('/');
    await expect(guestPage.locator('main h1, main h2').first()).toBeVisible();
    await expect(guestPage.getByRole('heading', { name: '新着のまとめ' })).toHaveCount(0);
    await expectNoCollectionsLinks(guestPage);
  });

  test('ログイン中の TOP にも「新着のまとめ」が出ない', async ({ userPage }) => {
    await userPage.goto('/');
    await expect(userPage.locator('main h1, main h2').first()).toBeVisible();
    await expect(userPage.getByRole('heading', { name: '新着のまとめ' })).toHaveCount(0);
    await expectNoCollectionsLinks(userPage);
  });

  test('PC: グローバルナビ・フッターに「まとめ」が無い（§2.4・§3.3）', async ({ guestPage }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'グローバルナビ・フッターは PC 幅で確認する');
    await guestPage.goto('/playlists');
    const nav = guestPage.getByRole('navigation', { name: 'グローバルナビゲーション' });
    await expect(nav.getByRole('link', { name: '再生リストを探す' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'まとめ' })).toHaveCount(0);
    await expect(guestPage.locator('footer').getByRole('link', { name: 'まとめを探す' })).toHaveCount(0);
    await expectNoCollectionsLinks(guestPage);
  });

  test('モバイル: 「さがす」のタブは3つで、まとめが無い（§2.7）', async ({ guestPage }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'さがすタブはモバイル幅で確認する');
    await guestPage.goto('/playlists');
    const tabs = guestPage.getByRole('navigation', { name: 'さがす' });
    await expect(tabs.getByRole('link')).toHaveCount(3);
    await expect(tabs.getByRole('link', { name: 'まとめを探す' })).toHaveCount(0);
    // 3タブが等幅で画面幅に収まる
    const widths = await tabs.getByRole('link').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    await expectNoCollectionsLinks(guestPage);
  });

  test('ユーザーメニューに「自分のまとめ」「保存したまとめ」が無い（§2.6）', async ({ userPage }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'ユーザーメニューは PC 幅で確認する');
    await userPage.goto('/playlists');
    await userPage.getByRole('button', { name: /^ユーザーメニュー/ }).click();
    const menu = userPage.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'プロフィール' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: '自分のまとめ' })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: '保存したまとめ' })).toHaveCount(0);
  });
});

test.describe('各ページのまとめの表示を外す', () => {
  test('再生リスト詳細: 「この再生リストを含むまとめ」「まとめに追加する」が無い（詳細仕様書 v1.14・レビュー投稿機能仕様書 v1.9.0）', async ({ userPage }) => {
    const href = await firstPlaylistHref(userPage);
    test.skip(!href, '/playlists にデータがありません');
    await userPage.goto(href!);
    // 視聴記録のセクション（「まとめに追加する」が置かれていた場所）が出るまで待つ
    await expect(userPage.getByRole('heading', { name: 'この再生リストに対してレビューする' })).toBeVisible();
    await expect(userPage.getByText('この再生リストを含むまとめ')).toHaveCount(0);
    await expect(userPage.getByRole('button', { name: /まとめに追加/ })).toHaveCount(0);
    await expectNoCollectionsLinks(userPage);
  });

  test('マイリスト: カードに「まとめに追加」が無い（マイリスト機能仕様書 v1.12 §5.2）', async ({ userPage }) => {
    await userPage.goto('/mylist');
    await expect(userPage.getByRole('heading', { name: 'マイリスト', exact: true }).first()).toBeVisible();
    const removeButtons = userPage.getByRole('button', { name: 'マイリストから削除' });
    const hasEntry = await removeButtons
      .first()
      .waitFor({ timeout: 10_000 })
      .then(
        () => true,
        () => false,
      );
    test.skip(!hasEntry, 'テスト用会員のマイリストが空です');
    await expect(userPage.getByRole('button', { name: /まとめ/ })).toHaveCount(0);
    await expectNoCollectionsLinks(userPage);
  });

  test('プロフィール（本人）: 「まとめ」「保存したまとめ」のセクションが無い（プロフィール仕様書 v1.8）', async ({ userPage }) => {
    const uid = await testUserUid();
    await userPage.goto(`/profile/${uid}`);
    // セクションの見出しは「マイリスト（N件）」のように件数が付く
    await expect(userPage.getByRole('heading', { name: /^マイリスト/ }).first()).toBeVisible();
    await expect(userPage.getByRole('heading', { name: /^まとめ/ })).toHaveCount(0);
    await expect(userPage.getByRole('heading', { name: /^保存したまとめ/ })).toHaveCount(0);
    await expectNoCollectionsLinks(userPage);
  });

  test('プロフィール（他人から見た表示）にもまとめのセクションが無い', async ({ guestPage }) => {
    const uid = await testUserUid();
    await guestPage.goto(`/profile/${uid}`);
    // 統計（公開設定にかかわらず出る）が出るまで待つ
    await expect(guestPage.getByText('レビュー投稿数')).toBeVisible();
    await expect(guestPage.getByRole('heading', { name: /^まとめ/ })).toHaveCount(0);
    await expectNoCollectionsLinks(guestPage);
  });
});
