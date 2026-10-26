// 主要画面のスモークテスト。各ページがエラー画面にならず、見出しが出て、横スクロールが出ないことを確認する
// （ページ一覧仕様書の主要ページ。画面幅は playwright.config.ts のプロジェクトごとに 1440・768・390px）。
import type { Page } from '@playwright/test';
import { expect, hasHorizontalScroll, test } from './support/fixtures';

type PageCase = { path: string; heading?: string };

const GUEST_PAGES: PageCase[] = [
  { path: '/' },
  { path: '/playlists', heading: '再生リストを探す' },
  { path: '/games', heading: 'ゲームタイトルから探す' },
  { path: '/channels', heading: 'チャンネル名から探す' },
  { path: '/collections', heading: 'まとめを探す' },
  { path: '/about', heading: '初めての方へ' },
  { path: '/terms', heading: '利用規約' },
  { path: '/privacy', heading: 'プライバシーポリシー' },
  { path: '/contact', heading: 'お問い合わせ' },
  { path: '/login', heading: 'ログイン' },
];

const USER_PAGES: PageCase[] = [
  { path: '/mylist', heading: 'マイリスト' },
  { path: '/history', heading: '視聴履歴' },
  { path: '/notifications', heading: '通知' },
  { path: '/settings', heading: '設定' },
  { path: '/collections/mine', heading: '自分のまとめ' },
  { path: '/contact/history', heading: 'お問い合わせ履歴' },
];

const ADMIN_PAGES: PageCase[] = [
  { path: '/admin', heading: 'ダッシュボード' },
  { path: '/admin/workflows', heading: '審査ワークフロー' },
  { path: '/admin/inquiries', heading: 'お問い合わせ' },
];

// 一覧ページから最初の1件をたどって開く詳細ページ（データが無い環境では飛ばす）
// exclude: 同じ接頭辞を持つ詳細以外のページ（「再生リストを追加する」ボタン等）
const DETAIL_PAGES = [
  { list: '/playlists', linkPrefix: '/playlists/', exclude: ['/playlists/new', '/playlists/proposals'] },
  { list: '/games', linkPrefix: '/games/', exclude: [] },
  { list: '/channels', linkPrefix: '/channels/', exclude: [] },
];

async function expectHealthyPage(page: Page, { path, heading }: PageCase) {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const response = await page.goto(path);
  expect(response?.status(), `${path} のステータス`).toBeLessThan(400);
  // ゲートのログイン画面に飛ばされていないこと（STAGING_GATE_PASSWORD の不一致を早く見つけるため）
  expect(new URL(page.url()).pathname, 'stg ゲートを通過できていません').not.toBe('/stg-login');

  if (heading) {
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
  } else {
    await expect(page.locator('main')).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'エラーが発生しました' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toHaveCount(0);
  expect(await hasHorizontalScroll(page), `${path} で横スクロールが出ています`).toBe(false);
  expect(pageErrors, `${path} でスクリプトエラー`).toEqual([]);
}

test.describe('未ログイン', () => {
  for (const c of GUEST_PAGES) {
    test(`${c.path} が開ける`, async ({ guestPage }) => {
      await expectHealthyPage(guestPage, c);
    });
  }

  for (const d of DETAIL_PAGES) {
    test(`${d.linkPrefix}[id] が開ける`, async ({ guestPage }) => {
      await guestPage.goto(d.list);
      // 画面幅によって隠れているリンクがあるため、表示中のものだけを対象にする
      const notExcluded = d.exclude.map((href) => `:not([href="${href}"])`).join('');
      const link = guestPage.locator(`main a[href^="${d.linkPrefix}"]${notExcluded}:visible`).first();
      const found = await link.waitFor({ timeout: 15_000 }).then(
        () => true,
        () => false,
      );
      test.skip(!found, `${d.list} にデータがありません`);
      const href = (await link.getAttribute('href'))!;
      await expectHealthyPage(guestPage, { path: href });
    });
  }

  for (const path of ['/mylist', '/settings', '/contact/history']) {
    test(`${path} は /login へ誘導される`, async ({ guestPage }) => {
      await guestPage.goto(path);
      await expect(guestPage).toHaveURL(/\/login(\?|$)/);
    });
  }

  test('/admin は /login へ誘導される', async ({ guestPage }) => {
    await guestPage.goto('/admin');
    await expect(guestPage).toHaveURL(/\/login(\?|$)/);
  });
});

test.describe('一般ユーザー', () => {
  for (const c of USER_PAGES) {
    test(`${c.path} が開ける`, async ({ userPage }) => {
      await expectHealthyPage(userPage, c);
    });
  }

  // 管理画面には入れず TOP へ戻される（管理_ダッシュボード仕様書 §1.1）
  test('/admin には入れない', async ({ userPage }) => {
    await userPage.goto('/admin');
    await expect(userPage).toHaveURL((url) => url.pathname === '/');
    await expect(userPage.getByRole('heading', { name: 'ダッシュボード' })).toHaveCount(0);
  });
});

test.describe('管理者', () => {
  for (const c of ADMIN_PAGES) {
    test(`${c.path} が開ける`, async ({ adminPage }) => {
      await expectHealthyPage(adminPage, c);
    });
  }
});
