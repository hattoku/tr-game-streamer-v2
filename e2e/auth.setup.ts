// テスト用会員（一般ユーザー・管理者）でログインし、状態を保存する（playwright.config.ts の setup プロジェクト）
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test as setup } from '@playwright/test';
import { AUTH_STATE, signInWithTestModeWidget, type TestUserKind } from './support/auth';
import { addGateCookie } from './support/gate';

for (const kind of ['user', 'admin'] as TestUserKind[]) {
  setup(`テスト用会員でログイン（${kind}）`, async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    await addGateCookie(context, baseURL!);
    const page = await context.newPage();
    await signInWithTestModeWidget(page, kind);
    mkdirSync(path.dirname(AUTH_STATE[kind]), { recursive: true });
    await context.storageState({ path: AUTH_STATE[kind], indexedDB: true });
    await context.close();
  });
}
