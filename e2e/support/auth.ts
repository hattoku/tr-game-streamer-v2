// テスト用会員でのログイン。テストモードウィジェット（共通UIコンポーネント仕様書 §7）のボタンを押してログインし、
// Firebase Auth の状態（IndexedDB）を含めて保存する。各テストは保存した状態から始める。
// ログインのたびに /api/test/sign-in がパスワードを設定し直すため、ログインは実行開始時に1回だけ行う。
import path from 'node:path';
import { expect, type BrowserContext, type Page } from '@playwright/test';

export type TestUserKind = 'user' | 'admin';

const KIND_LABEL: Record<TestUserKind, string> = { user: '一般ユーザー', admin: '管理者' };

export const AUTH_STATE: Record<TestUserKind, string> = {
  user: path.join(__dirname, '..', '.auth', 'user.json'),
  admin: path.join(__dirname, '..', '.auth', 'admin.json'),
};

export async function signInWithTestModeWidget(page: Page, kind: TestUserKind): Promise<void> {
  await page.goto('/');
  const widget = page.getByRole('complementary', { name: 'テストモード' });
  await expect(widget, 'テストモードウィジェットが表示されていません（stg のテストモードが無効の可能性）').toBeVisible();
  await widget.getByRole('button', { name: `${KIND_LABEL[kind]}でログイン` }).click();
  await expect(widget.getByText(`現在: ${KIND_LABEL[kind]}でログイン中`)).toBeVisible();
}

/**
 * テストモードウィジェットを隠す。画面右下に固定表示され、送信ボタン等と重なってクリックを妨げることがあるため、
 * ログイン後のテストでは表示しない
 */
export async function hideTestModeWidget(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = 'aside[aria-label="テストモード"] { display: none !important; }';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  });
}
