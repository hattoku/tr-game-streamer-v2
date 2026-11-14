// マイページ（/mypage、ページ マイページ 仕様書）。§3 項目一覧・§4 ボトムタブの遷移先とアクティブ表示・§2 アクセス条件を確認する。
// ボトムタブはモバイル幅（767px以下）だけに出るため、タブの確認は mobile プロジェクトだけで行う。
import { expect, hasHorizontalScroll, test } from './support/fixtures';

const USER_ITEMS = [
  { name: '視聴履歴', href: '/history' },
  { name: '通知', href: '/notifications' },
  { name: '提案履歴', href: '/playlists/proposals' },
  { name: 'お問い合わせ履歴', href: '/contact/history' },
  { name: '設定', href: '/settings' },
];

test.describe('項目一覧（§3）', () => {
  test('一般ユーザーには自分用の項目が並び、管理画面は出ない', async ({ userPage }) => {
    await userPage.goto('/mypage');
    await expect(userPage.getByRole('heading', { name: 'マイページ', exact: true })).toBeVisible();
    const main = userPage.locator('main');
    for (const item of USER_ITEMS) {
      await expect(main.getByRole('link', { name: item.name, exact: true })).toHaveAttribute('href', item.href);
    }
    await expect(main.getByRole('link', { name: /^管理画面/ })).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'ログアウト' })).toBeVisible();
    expect(await hasHorizontalScroll(userPage)).toBe(false);
  });

  test('一番上のカードからプロフィールへ行ける', async ({ userPage }) => {
    await userPage.goto('/mypage');
    await userPage.getByTestId('mypage-profile').click();
    await expect(userPage).toHaveURL(/\/profile\/[^/]+$/);
  });

  test('項目を押すとそのページが開く', async ({ userPage }) => {
    await userPage.goto('/mypage');
    await userPage.locator('main').getByRole('link', { name: '提案履歴', exact: true }).click();
    await expect(userPage).toHaveURL(/\/playlists\/proposals$/);
    await expect(userPage.getByRole('heading', { name: '提案履歴' }).first()).toBeVisible();
  });

  test('管理者には管理画面の項目も出る', async ({ adminPage }) => {
    await adminPage.goto('/mypage');
    await expect(adminPage.locator('main').getByRole('link', { name: /^管理画面/ })).toHaveAttribute('href', '/admin');
  });
});

test.describe('ボトムタブ（§4）', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'ボトムタブはモバイル幅だけに出る');
  });

  test('ログイン中は「マイページ」タブで /mypage が開き、タブがアクティブになる', async ({ userPage }) => {
    await userPage.goto('/');
    const nav = userPage.getByRole('navigation', { name: 'メインナビゲーション' });
    await nav.getByRole('link', { name: 'マイページ' }).click();
    await expect(userPage).toHaveURL(/\/mypage$/);
    await expect(nav.getByRole('link', { name: 'マイページ' })).toHaveAttribute('aria-current', 'page');
  });

  test('マイページから辿った先（提案履歴など）でも「マイページ」タブがアクティブのまま', async ({ userPage }) => {
    const nav = userPage.getByRole('navigation', { name: 'メインナビゲーション' });
    for (const path of ['/playlists/proposals', '/contact/history', '/settings', '/notifications']) {
      await userPage.goto(path);
      await expect(nav.getByRole('link', { name: 'マイページ' }), path).toHaveAttribute('aria-current', 'page');
      await expect(nav.getByRole('link', { name: 'さがす' }), path).not.toHaveAttribute('aria-current', 'page');
    }
  });

  test('「さがす」の再生リスト一覧では「さがす」タブがアクティブ', async ({ userPage }) => {
    await userPage.goto('/playlists');
    const nav = userPage.getByRole('navigation', { name: 'メインナビゲーション' });
    await expect(nav.getByRole('link', { name: 'さがす' })).toHaveAttribute('aria-current', 'page');
  });

  test('未ログインの「マイページ」タブはアカウント作成へ', async ({ guestPage }) => {
    await guestPage.goto('/');
    const nav = guestPage.getByRole('navigation', { name: 'メインナビゲーション' });
    await expect(nav.getByRole('link', { name: 'マイページ' })).toHaveAttribute('href', '/login?mode=signup');
  });
});
