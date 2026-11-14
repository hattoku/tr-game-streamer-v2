---
title: プロジェクト概要
type: meta
date: 2026-09-08
updated: 2026-11-14
---

# tr-game-streamer-v2 概要

Next.js 16 + Firebase(Firestore) 製のゲーム実況・配信系Webサービス。
このページはコーディング支援の前提となる**技術的な構造**の概観。企画・仕様・
設計判断の背景は `c:\development\ai_knowledge\ak_tr_game_streamer_dev`
（別リポジトリ、役割分担は [[CLAUDE.md]] 参照）を参照すること。

## 技術スタック（2026-09-09時点、[[2026-09-09-tech-stack-upgrade]]で最新化・完全固定）
- フロントエンド: Next.js 16.3.4 / React 19.2.8 / TypeScript 7.0.2（ネイティブ実装版）
- バックエンド/データ: Firebase 12.18.0（Firestore, Auth, Functions等）
- 依存バージョンは完全固定方針（[[依存バージョン固定方針]]参照）
- Firestoreセキュリティルールは `firestore.rules` で管理・デプロイ済み（[[firestoreセキュリティルール方針]]参照）
- デプロイ: `Dockerfile` + `cloudbuild.yaml`（Cloud Run想定）、
  `deploy.ps1` / `deploy.sh`、`.firebaserc` でstg/prod環境分離

## ドキュメント構成（`document/` フォルダ、詳細な要約は ak_tr_game_streamer_dev 側）
- **plan/** 企画書、**specification/common|page|management|db/** 各種仕様書、
  **report/** 調査レポート、**master/** 初期マスタデータ
- 全体像: `document/specification/仕様書トレーサビリティ・マトリクス.md`

企画・仕様の中身そのものは [[CLAUDE.md|役割分担]] によりこのWikiでは扱わない。
実装作業中に参照した仕様書があれば、このWiki側では「実装がどう仕様に対応したか」
という観点で [[sources]] にセッション記録として残す。

## 2026-11 時点の構造（リブランディング後）

- **掲載チャンネル起点のキュレーション**: 掲載チャンネル（DB は `exploration_channels`）の再生リストを毎日の巡回（`lib/channel-sweep.ts`）で全件保存し、
  `playlists.listingStatus` で一般画面に出すかを決める → [[掲載状態と検索面]]
- **一覧はサーバー側検索**: Cloud Run のメモリ索引（[[catalog-server]]）から `/api/catalog/*` で1ページずつ返す
- **定期ジョブ（Cloud Scheduler → Cloud Run、`X-Cron-Secret`）**: `refresh-new-videos-daily` 6:00（新着の差分取得＋巡回＋30日ルール）、
  `channel-popularity-daily` 4:00（人気の集計）、`purge-inquiry-attachments-daily` 4:30（添付画像の削除）
- **Storage**: お問い合わせの添付画像だけ。US-EAST1、クライアントは全拒否で API 経由
- **テスト**: stg に対する Playwright E2E（`e2e/`、[[2026-10-25-e2e-foundation]]）。stg へのデプロイはクラウドから（[[クラウドからのstgデプロイ]]）、本番はユーザーの手元から
- まとめ機能は取り下げ中（`lib/feature-flags.ts`、データとコードは残す）

