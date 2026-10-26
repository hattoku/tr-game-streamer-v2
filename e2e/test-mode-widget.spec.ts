// テストモードウィジェットを畳める（共通 uiコンポーネント フロント 仕様書 §7.4「畳む」）。
// 他のテストはウィジェットを隠すフィクスチャを使うので、ここだけ自前でコンテキストを作る。
import { test, expect } from '@playwright/test';
import { addGateCookie } from './support/gate';

test('テストモードウィジェットを畳み、リロード後も畳んだままで、開き直せる', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  await addGateCookie(context, baseURL!);
  const page = await context.newPage();
  try {
    await page.goto('/');
    const widget = page.getByRole('complementary', { name: 'テストモード' });
    await expect(widget.getByRole('button', { name: '一般ユーザーでログイン' })).toBeVisible();

    await widget.getByRole('button', { name: 'テストモードを畳む' }).click();
    await expect(widget.getByRole('button', { name: '一般ユーザーでログイン' })).toHaveCount(0);
    await expect(widget.getByRole('button', { name: 'テストモードを開く' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('complementary', { name: 'テストモード' }).getByRole('button', { name: 'テストモードを開く' })).toBeVisible();

    await page.getByRole('button', { name: 'テストモードを開く' }).click();
    await expect(page.getByRole('button', { name: '一般ユーザーでログイン' })).toBeVisible();
  } finally {
    await context.close();
  }
});
