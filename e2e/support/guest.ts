import { expect, type Page } from '@playwright/test';

/**
 * 未ログインの表示になるまで待つ。ログイン状態の読み込み中にリンクを押すと、ログイン要求モーダルを出さずにそのまま遷移する仕様のため
 * （共通 uiコンポーネント フロント 仕様書 §5.2）。ヘッダー右上の「ログイン」が出たら読み込み済み
 */
export async function waitForGuest(page: Page) {
  await expect(page.locator('header').getByRole('link', { name: 'ログイン', exact: true })).toBeVisible({ timeout: 30_000 });
}
