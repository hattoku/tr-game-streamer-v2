// E2Eテスト（Playwright）の設定。stg に対して実行する（計画: plans/自動テスト-E2E-実装計画.md、
// テスト方針: .agent/rules/development_flow.md §3）。実行は scripts/run-e2e-stg.sh（接続先URLと認証情報を用意する）。
// 本番には接続しない（e2e/support/env.ts で本番のホストを拒否する）。
import { defineConfig, devices } from '@playwright/test';
import { resolveBaseUrl } from './e2e/support/env';

const baseURL = resolveBaseUrl();

// 画面幅は「390・768・1440px で横スクロールが出ない」確認に合わせる（共通UIコンポーネント仕様書のブレークポイント）
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
} as const;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  // stg（共有の Cloud Run・Firestore）に負荷をかけすぎないよう並列数を抑える
  workers: 2,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // テスト用会員（一般ユーザー・管理者）でログインし、状態を保存する。他のプロジェクトはこれに依存する
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS.desktop },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS.mobile, hasTouch: true, isMobile: true },
    },
    // タブレット幅はレイアウト崩れの確認のみ（機能テストはデスクトップとモバイルで行う）
    {
      name: 'tablet',
      dependencies: ['setup'],
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS.tablet },
    },
  ],
});
