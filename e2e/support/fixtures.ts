// テストで使うページ。未ログイン（guestPage）・一般ユーザー（userPage）・管理者（adminPage）を同じテストの中で
// 同時に使えるよう、それぞれ別のブラウザコンテキストで開く。どれも stg ゲートは通過済みで、テストモードウィジェットは隠す。
import { test as base, type Browser, type Page, type TestInfo } from '@playwright/test';
import { AUTH_STATE, hideTestModeWidget, type TestUserKind } from './auth';
import { addGateCookie } from './gate';

type Fixtures = { guestPage: Page; userPage: Page; adminPage: Page };

function pageFixture(kind: TestUserKind | null) {
  return async ({ browser, baseURL }: { browser: Browser; baseURL: string | undefined }, use: (page: Page) => Promise<void>, testInfo: TestInfo) => {
    // プロジェクト（desktop / mobile / tablet）の画面幅などを引き継ぐ
    const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor, locale, timezoneId } = testInfo.project.use;
    const context = await browser.newContext({
      baseURL,
      viewport,
      isMobile,
      hasTouch,
      userAgent,
      deviceScaleFactor,
      locale,
      timezoneId,
      ...(kind ? { storageState: AUTH_STATE[kind] } : {}),
    });
    await addGateCookie(context, baseURL!);
    await hideTestModeWidget(context);
    const page = await context.newPage();
    await use(page);
    await context.close();
  };
}

export const test = base.extend<Fixtures>({
  guestPage: pageFixture(null),
  userPage: pageFixture('user'),
  adminPage: pageFixture('admin'),
});

export { expect } from '@playwright/test';

/** ページが API を呼ぶときの ID トークンを横取りする（API を直接叩く確認に使う） */
export async function captureIdToken(page: Page, path: string): Promise<string> {
  const request = page.waitForRequest((r) => r.url().includes('/api/') && !!r.headers()['authorization']);
  await page.goto(path);
  const auth = (await request).headers()['authorization'];
  return auth.replace(/^Bearer /, '');
}

/** 横スクロールが出ていないこと（390・768・1440px の確認） */
export async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}
