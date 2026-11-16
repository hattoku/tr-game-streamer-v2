// マイリストと視聴履歴の切り替え（ページ マイリスト機能仕様書 §2.4、ページ 視聴履歴 仕様書 §2.4、
// 共通 uiコンポーネント フロント 仕様書 §2.7 のボトムタブのアクティブ判定）。
import { expect, hasHorizontalScroll, test } from './support/fixtures';

const SWITCH = 'マイリストと視聴履歴の切り替え';

test.describe('見出しの切り替え（マイリスト §2.4）', () => {
  test('マイリストでは「マイリスト」が見出し、「視聴履歴」がリンクになり、押すと視聴履歴へ行ける', async ({ userPage }) => {
    await userPage.goto('/mylist');
    const sw = userPage.getByRole('navigation', { name: SWITCH });
    await expect(sw.getByRole('heading', { name: 'マイリスト', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(sw.getByRole('link', { name: '視聴履歴', exact: true })).toHaveAttribute('href', '/history');
    expect(await hasHorizontalScroll(userPage)).toBe(false);

    await sw.getByRole('link', { name: '視聴履歴', exact: true }).click();
    await expect(userPage).toHaveURL(/\/history$/);
    await expect(sw.getByRole('heading', { name: '視聴履歴', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('視聴履歴では「視聴履歴」が見出し、「マイリスト」を押すとマイリストへ戻れる', async ({ userPage }) => {
    await userPage.goto('/history');
    const sw = userPage.getByRole('navigation', { name: SWITCH });
    await expect(sw.getByRole('heading', { name: '視聴履歴', exact: true })).toBeVisible();
    await expect(sw.getByRole('link', { name: 'マイリスト', exact: true })).toHaveAttribute('href', '/mylist');
    expect(await hasHorizontalScroll(userPage)).toBe(false);

    await sw.getByRole('link', { name: 'マイリスト', exact: true }).click();
    await expect(userPage).toHaveURL(/\/mylist$/);
    await expect(sw.getByRole('heading', { name: 'マイリスト', exact: true })).toBeVisible();
  });
});

test.describe('ボトムタブ（UI仕様書 §2.7）', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'ボトムタブはモバイル幅だけに出る');
  });

  test('視聴履歴でも「マイリスト」タブがアクティブで、「マイページ」はアクティブにならない', async ({ userPage }) => {
    const nav = userPage.getByRole('navigation', { name: 'メインナビゲーション' });
    for (const path of ['/mylist', '/history']) {
      await userPage.goto(path);
      await expect(nav.getByRole('link', { name: 'マイリスト' }), path).toHaveAttribute('aria-current', 'page');
      await expect(nav.getByRole('link', { name: 'マイページ' }), path).not.toHaveAttribute('aria-current', 'page');
    }
  });
});
