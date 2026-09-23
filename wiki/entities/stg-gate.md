---
title: lib/stg-gate.ts
type: entity
date: 2026-09-23
updated: 2026-09-23
---

# lib/stg-gate.ts

[[proxy]]（アクセス時の検証）と `app/api/stg-gate/route.ts`（ログイン時の発行）の両方から
使う、Cookieゲートのトークン導出ロジック。

## 役割

- `STG_GATE_COOKIE_NAME`: Cookie名（`stg_gate`）。
- `STG_GATE_MAX_AGE_SECONDS`: Cookie有効期限（30日 = `60*60*24*30`）。
- `computeStgGateToken(password)`: 生パスワードをCookieに保持しないため、`STAGING_GATE_PASSWORD` を
  HMAC鍵として固定メッセージ（`"stg-gate-v1"`）に署名した値（hex）をトークンとして使う。パスワードを
  知っていれば誰でも同じ値を計算できるため、追加のシークレットは不要（Basic認証時代と同等の信頼境界）。
- Web Crypto API（`globalThis.crypto.subtle`）を使用。proxy.ts はEdge相当ランタイムで動くため、
  Node専用の `crypto.createHmac` は使えない点に注意。

## 関連
- [[proxy]]
- [[2026-09-23-stg-cookie-gate]]
