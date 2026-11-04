// コンテンツ収集（/admin/collection 配下）の E2E で共用する部品。データは Admin SDK で直接作る（YouTube に無い ID）。
import type { Page } from '@playwright/test';
import { db as e2eDb } from './cleanup';

export function randomId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export async function gamesTitled(title: string) {
  return (await e2eDb().collection('games').where('title', '==', title).get()).docs;
}

export function section(page: Page, channelTitle: string) {
  return page.locator('section').filter({ hasText: channelTitle });
}
