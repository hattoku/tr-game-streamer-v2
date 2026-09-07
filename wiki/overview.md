---
title: プロジェクト概要
type: meta
date: 2026-09-08
updated: 2026-09-08
---

# tr-game-streamer-v2 概要

Next.js 14 + Firebase(Firestore) 製のゲーム実況・配信系Webサービス。
このページはコーディング支援の前提となる**技術的な構造**の概観。企画・仕様・
設計判断の背景は `c:\development\ai_knowledge\ak_tr_game_streamer_dev`
（別リポジトリ、役割分担は [[CLAUDE.md]] 参照）を参照すること。

## 技術スタック
- フロントエンド: Next.js 14 / React 18 / TypeScript
- バックエンド/データ: Firebase (Firestore, Auth, Functions等)
- デプロイ: `Dockerfile` + `cloudbuild.yaml`（Cloud Run想定）、
  `deploy.ps1` / `deploy.sh`、`.firebaserc` でstg/prod環境分離

## ドキュメント構成（`document/` フォルダ、詳細な要約は ak_tr_game_streamer_dev 側）
- **plan/** 企画書、**specification/common|page|management|db/** 各種仕様書、
  **report/** 調査レポート、**master/** 初期マスタデータ
- 全体像: `document/specification/仕様書トレーサビリティ・マトリクス.md`

企画・仕様の中身そのものは [[CLAUDE.md|役割分担]] によりこのWikiでは扱わない。
実装作業中に参照した仕様書があれば、このWiki側では「実装がどう仕様に対応したか」
という観点で [[sources]] にセッション記録として残す。
