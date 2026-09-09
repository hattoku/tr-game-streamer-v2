---
title: proxy.ts（旧middleware.ts）
type: entity
date: 2026-09-09
updated: 2026-09-09
---

# proxy.ts（旧middleware.ts）

Next.js 16の `proxy` 規約に対応するファイル（旧 `middleware.ts`。[[2026-09-09-tech-stack-upgrade]] で
公式codemodにより自動リネーム）。

## 役割

ステージング環境（`NEXT_PUBLIC_APP_ENV=stg`）にのみBasic認証を適用する。
`STAGING_BASIC_AUTH_USER` / `STAGING_BASIC_AUTH_PASSWORD` の両方が設定されている場合のみ動作し、
未設定時はスルーする（安全側のフェイルクローズ的挙動を意図した設計）。

- エクスポート関数名は `middleware` ではなく `proxy`（Next.js 16の規約変更に伴う）。
- `config.matcher` で `_next/static` / `_next/image` / `favicon.ico` を除外。

## 関連
- [[2026-09-09-tech-stack-upgrade]]（規約移行の経緯）
