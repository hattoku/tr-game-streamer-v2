// stg（実態は全環境）保護用のCookieゲート。proxy.ts と app/api/stg-gate/route.ts の両方から使う。
// パスワード自体はCookieに保持せず、STAGING_GATE_PASSWORD をHMAC鍵として固定メッセージに
// 署名した値をトークンとして発行・照合する（パスワードを知っていれば誰でも同じ値を計算できるため、
// 追加のシークレットは不要。Basic認証時代と同等の信頼境界）。
// proxy.ts はEdge相当ランタイムで動くため、Node専用の crypto.createHmac ではなく
// Web Crypto API（globalThis.crypto.subtle）を使う。

// Firebase Hostingは`__session`以外の名前のCookieをCloud Runへのリクエストからすべて除去するため、
// この名前を使う必要がある（他の名前だと直接のCloud Run URLでは動くがpuremite.net経由で認証が
// 通らない不具合になる。2026-09-23に本番で発覚・特定）
export const STG_GATE_COOKIE_NAME = '__session';
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
