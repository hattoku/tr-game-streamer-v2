---
title: stg に対する Playwright E2E の仕組み
type: source
date: 2026-10-25
updated: 2026-11-14
commit: 3a019d6
---

# stg に対する Playwright E2E の仕組み

PR #2（2026-10-26 main へマージ、`3a019d6`）。主な実装コミットは `62112b2`・`dd99f56`・`2d950ae`。

## 決まったこと（ユーザー決定 2026-10-24〜25）

- **Claude が実装後に stg へデプロイして E2E を回し、結果を完了報告に添える**。GitHub Actions は後回し
- stg は**テストモードを常時有効**（`deploy-stg-cloud.sh` が `_TEST_MODE=true` でデプロイ）。既存のテスト用会員で `/api/test/sign-in` を使う
- stg ゲートのパスワードはクラウド環境の環境変数 `STAGING_GATE_PASSWORD`。チャットには貼らない
- テストデータは本文を `[E2E]` で始め、実行の前後に Admin SDK で消す（stg 用 SA に `roles/datastore.user`）

## 実装

- `playwright.config.ts`、`e2e/`（`smoke.spec.ts` ほか）、`e2e/support/`（`env.ts` は本番のホストを拒否、`fixtures.ts` の `userPage`・`adminPage`・`guestPage`、`cleanup.ts`）
- 実行は `npm run test:e2e:stg`（`scripts/run-e2e-stg.sh`）
- 手順と書き方は `.agent/rules/development_flow.md` §4 に書いた（以後の正はそちら）

## ハマりどころ

- クラウド環境の環境変数は .env 形式で、`#` 以降がコメント扱いになる。値に `#` を含むときはシングルクォートで囲む
- PR #2 より前に main から分かれたブランチの `deploy-stg-cloud.sh` には `_TEST_MODE` が無く、そこからデプロイするとテストモードが外れる（main を取り込めば直る）
- 同時に2つ実行しない（後始末が互いの `[E2E]` データを消す）→ [[stgとE2Eの同時実行]]

## 関連

- [[クラウドからのstgデプロイ]]・[[ステージング環境運用方針]]
