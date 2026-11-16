// ユーザードロップダウンの整理（2026-11-16）。共通 uiコンポーネント フロント 仕様書 v2.5 §2.6 の確認項目。
// ユーザー名・メールの直下にプロフィール・設定、「サポート」の見出しの下に提案履歴・お問い合わせ履歴、スマホではマイリストを出さない。
import { expect, test } from './support/fixtures';

/** メニュー項目のラベルを上から順に（未読数などの付記は除く） */
async function menuItemLabels(menu: import('@playwright/test').Locator) {
  const texts = await menu.getByRole('menuitem').allInnerTexts();
  return texts.map((t) => t.replace(/\s*未読.*$/s, '').replace(/\s*未処理.*$/s, '').trim());
}

test('§2.6 ユーザー名の下にプロフィール・設定、サポートの下に提案履歴・お問い合わせ履歴が並ぶ', async ({ userPage }, testInfo) => {
  await userPage.goto('/playlists');
  await userPage.getByRole('button', { name: /^ユーザーメニュー/ }).click();
  const menu = userPage.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'プロフィール' })).toBeVisible();

  const labels = await menuItemLabels(menu);
  // 先頭は「自分のアカウント」のまとまり
  expect(labels.slice(0, 2)).toEqual(['プロフィール', '設定']);

  // マイリストはスマホでは出さない（ボトムタブにあるため）。視聴履歴は全幅で出す
  const isMobile = testInfo.project.name === 'mobile';
  const expectedNav = isMobile ? ['視聴履歴'] : ['マイリスト', '視聴履歴'];
  expect(labels.slice(2, 2 + expectedNav.length)).toEqual(expectedNav);

  // 「サポート」の見出しのまとまりに提案履歴・お問い合わせ履歴
  const support = menu.getByRole('group').filter({ hasText: 'サポート' });
  await expect(support.getByRole('menuitem')).toHaveCount(2);
  await expect(support.getByRole('menuitem').nth(0)).toContainText('提案履歴');
  await expect(support.getByRole('menuitem').nth(1)).toContainText('お問い合わせ履歴');

  // 最後はログアウト
  expect(labels.at(-1)).toBe('ログアウト');

  // 設定を選ぶと設定ページへ
  await menu.getByRole('menuitem', { name: '設定' }).click();
  await expect(userPage).toHaveURL(/\/settings$/);
});
