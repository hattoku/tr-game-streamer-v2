---
title: Wiki索引
type: meta
date: 2026-09-08
updated: 2026-09-09
---

# Wiki 索引

tr-game-streamer-v2 の**コーディング支援用**Wiki（実装の変更履歴・技術的決定を記録）。
設計・企画レベルの検討は別リポジトリ `ak_tr_game_streamer_dev` が担当する
（役割分担は [[CLAUDE.md]] 参照）。プロジェクト全体像は [[overview]] を参照。

## Sources
- [[2026-09-09-firestore-security-rules]] — Firestoreセキュリティルールの本設計・本番デプロイ
- [[2026-09-09-tech-stack-upgrade]] — 技術スタックの最新化とバージョン固定

## Entities
- [[proxy]] — proxy.ts（旧middleware.ts、Next.js 16のproxy規約対応）

## Concepts
- [[firestoreセキュリティルール方針]] — ロール判定・コレクション別ポリシー
- [[依存バージョン固定方針]] — package.jsonのバージョン記法方針

## Analyses
（まだページなし）

---
このindexはIngest / Query操作のたびに更新すること。
