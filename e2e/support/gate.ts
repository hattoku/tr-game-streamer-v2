// stg ゲート（proxy.ts・lib/stg-gate.ts）を通過するための Cookie をブラウザにセットする。
// ログイン画面（/stg-login）を毎回通らないよう、ゲートと同じ計算でトークンを作る。
import type { BrowserContext } from '@playwright/test';
import { STG_GATE_COOKIE_NAME, computeStgGateToken } from '../../lib/stg-gate';
import { gatePassword } from './env';

export async function addGateCookie(context: BrowserContext, baseURL: string): Promise<void> {
  const password = gatePassword();
  if (!password) return;
  const { hostname } = new URL(baseURL);
  await context.addCookies([
    {
      name: STG_GATE_COOKIE_NAME,
      value: await computeStgGateToken(password),
      domain: hostname,
      path: '/',
      secure: baseURL.startsWith('https:'),
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}
