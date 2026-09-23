---
title: proxy.ts（旧middleware.ts）
type: entity
date: 2026-09-09
updated: 2026-09-23
---

# proxy.ts（旧middleware.ts）

Next.js 16の `proxy` 規約に対応するファイル（旧 `middleware.ts`。[[2026-09-09-tech-stack-upgrade]] で
公式codemodにより自動リネーム）。

## 役割

全環境（検証段階のため本番含む。変数名の"STAGING_"はBasic認証導入時の名残）にCookieベースの
共有パスワードゲートを適用する。`STAGING_GATE_PASSWORD`（[[stg-gate]]）が設定されている場合のみ
動作し、未設定時はスルーする（安全側のフェイルクローズ的挙動を意図した設計）。

- エクスポート関数名は `middleware` ではなく `proxy`（Next.js 16の規約変更に伴う）。
- `config.matcher` で `_next/static` / `_next/image` / `favicon.ico` / `api` / `stg-login` を除外。
- 2026-09-23、HTTP Basic認証からCookieゲートへ移行（[[2026-09-23-stg-cookie-gate]]）。Basic認証は
  ブラウザプロセス単位でしか認証情報を保持できず再入力が頻発するため、ログイン後30日間有効な
  Cookie方式に変更した。

## 関連
- [[2026-09-09-tech-stack-upgrade]]（規約移行の経緯）
- [[stg-gate]]（Cookieゲートのトークン導出ロジック）
- [[2026-09-23-stg-cookie-gate]]（Basic認証→Cookieゲート移行の実装記録）
