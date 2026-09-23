// stg（実態は全環境）保護用のCookieゲート。proxy.ts と app/api/stg-gate/route.ts の両方から使う。
// パスワード自体はCookieに保持せず、STAGING_GATE_PASSWORD をHMAC鍵として固定メッセージに
// 署名した値をトークンとして発行・照合する（パスワードを知っていれば誰でも同じ値を計算できるため、
// 追加のシークレットは不要。Basic認証時代と同等の信頼境界）。
// proxy.ts はEdge相当ランタイムで動くため、Node専用の crypto.createHmac ではなく
// Web Crypto API（globalThis.crypto.subtle）を使う。

export const STG_GATE_COOKIE_NAME = 'stg_gate';
export const STG_GATE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30日間

const SIGNING_MESSAGE = 'stg-gate-v1';

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function computeStgGateToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(SIGNING_MESSAGE));
  return toHex(signature);
}
