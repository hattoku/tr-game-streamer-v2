// 管理画面ヘッダーのスマホ対応（2026-11-19）。デザイントークン仕様書 v2.16 §14.1 / 管理_ダッシュボード仕様書 v2.2 §9.4 の確認項目。
// スマホ幅ではナビを横に並べず、ハンバーガーのドロワーに縦一覧で出す。PC 幅は従来どおりロゴ横にナビを並べる。
import { expect, test } from './support/fixtures';

const ITEMS = ['ダッシュボード', '審査ワークフロー', 'お問い合わせ', 'お知らせ', 'コンテンツ収集', 'ユーザー'];

test('§14.1 スマホ: ハンバーガーのドロワーに管理画面の全ページと「サービスへ戻る」が並び、横にはみ出さない', async ({ adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'スマホ幅のみ');
  await adminPage.goto('/admin');
  await expect(adminPage.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();

  // 画面全体が横に広がっていない
  const overflow = await adminPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await adminPage.getByRole('button', { name: '管理メニューを開く' }).click();
  const nav = adminPage.getByRole('navigation', { name: '管理画面メニュー' });
  for (const label of ITEMS) {
    const link = nav.getByRole('link', { name: new RegExp(`^${label}`) });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(390); // 画面外にはみ出さない
  }
  await expect(adminPage.getByRole('link', { name: 'サービスへ戻る' })).toBeVisible();

  // 選ぶとそのページへ移動しドロワーが閉じる
  await nav.getByRole('link', { name: 'お知らせ' }).click();
  await expect(adminPage).toHaveURL(/\/admin\/notices$/);
  await expect(nav).toBeHidden();
});

test('§14.1 PC: ナビはロゴ横に並び、ハンバーガーは出ない', async ({ adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'PC幅のみ');
  await adminPage.goto('/admin');
  await expect(adminPage.getByRole('button', { name: '管理メニューを開く' })).toBeHidden();
  const nav = adminPage.getByRole('navigation', { name: '管理画面ナビゲーション' });
  for (const label of ITEMS) await expect(nav.getByRole('link', { name: new RegExp(`^${label}`) })).toBeVisible();
});
