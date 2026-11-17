---
title: 単体テスト（Vitest）を入れ、取り下げたまとめ機能のコードを消す
type: source
date: 2026-11-17
updated: 2026-11-17
---

# 単体テスト（Vitest）を入れ、取り下げたまとめ機能のコードを消す

PR #60（2026-11-17）。Notion チケット「リファクタリング①：単体テストの仕組みを入れ、まとめ機能のコードを消す」。
進め方は /mnt/project-files/plans/リファクタリング/リファクタリングの進め方-検討.md（§5 の1・2）。仕様はまとめ機能 v2.2、一覧のサーバー側検索 v1.5、
Firestore データモデル設計書 v3.1、プロフィール v1.12、トレーサビリティ・マトリクス v1.22。

## 単体テスト（ユーザー決定: Vitest で DB を使わない処理だけ）

- `vitest@5.1.0`（開発用）。`npm test`（1回）／`npm run test:watch`。設定は `vitest.config.mts`（`@/` を tsconfig と同じく直下に解決）
- テストは `tests/unit/*.test.ts`（Docker イメージには入れない。`.dockerignore`）。Firestore エミュレーターは使わず、DB を含む確認は stg の E2E に任せる
- 最初の8ファイル91件: `listing-rules`（掲載の判定）、`exploration-rules`（ゲーム推定・楽天の検索語・タイトル由来タグ）、`popularity-shared`（人気の点数）、
  `rakuten-shared`（商品名の正規化・照合）、`catalog-shared`（一覧の入力の読み方・ページ分け）、`change-proposal-shared`、`rate-limit`、小さな検証・整形
- 手順は `.agent/rules/development_flow.md` §4「単体テスト（Vitest）」。判定や計算が DB を使う処理の中にあるときは、純粋な関数に分けてからテストする

## まとめ機能のコード削除（ユーザー決定: コードだけ消す、データは残す）

- 削除: `app/(main)/collections/`、`app/api/collections/`、`components/collections/`、`components/top/NewCollectionsSection.tsx`、
  `lib/collections.ts`・`collections-shared.ts`・`collections-server.ts`、`lib/feature-flags.ts`（`COLLECTIONS_ENABLED`）、
  `PlaylistGrid` の `fetchPublicPlaylists`（全件取得。まとめでだけ使っていた）
- 各画面は `COLLECTIONS_ENABLED=false` 側の表示だけを残したので、見た目は段階2（[[2026-11-01-rebranding-stage2-collections-withdrawn]]）と同じ
- `/collections*` はページが無くなり Next.js がそのまま 404 を返すので、[[proxy]] の書き換え（`/__closed`）を外した（手元の build＋start で HTTP 404 を確認）
- `readJsonObject` は `lib/request-json.ts` へ移した（お問い合わせ・プロフィールの API が使う）
- プロフィール API の応答から `collections`・`collectionThumbnailById` を外した
- データ `collections`・`saved_collections` と Firestore ルールは残す（ルールはコメントだけ更新）。戻すときは git の履歴から

## 実装メモ（Claude の判断）

- 表示名・アイコンの変更で `collections` の作成者名・アイコンを揃える処理（`syncUserDenormalizedFields`）も外した（プロフィール仕様書 v1.8 で「無くしてもよい」）。
  まとめを戻すときは作成者名の揃え直しが要る
- E2E `e2e/collections-withdrawn.spec.ts` は「ページ・API が 404、どこにもまとめが出ない」確認として残した
- main（#57〜#59）を取り込んだときに `MylistCard.tsx` の import が衝突。#59 の `FallbackImage` を残し、まとめの import を消して解消
