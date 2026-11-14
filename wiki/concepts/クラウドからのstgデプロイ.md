---
title: クラウドからのstgデプロイ
type: concept
date: 2026-11-14
updated: 2026-11-14
---

# クラウドからのstgデプロイ

クラウドセッション（Claude Code on the web）から stg へデプロイするときの前提。手順は `/mnt/project-files/plans/クラウドからstgデプロイ-設定手順.md`、経緯は [[2026-10-28-cloud-stg-deploy]]。

## 前提

- `scripts/deploy-stg-cloud.sh`（bash）。**本番はクラウドから行わない**（ユーザー判断）。本番はユーザーが手元の PowerShell で `deploy.ps1 prod`
- 認証は環境変数 `GCP_SA_KEY_STG_B64`（SA `claude-stg-deployer`）。鍵はチャットに貼らせない
- クラウド環境には gcloud があり、pwsh は無い。firebase CLI は `npx firebase-tools@15`
- 既定で入っている `CLOUDSDK_AUTH_ACCESS_TOKEN` は unset し、専用の `CLOUDSDK_CONFIG` を使う
- Cloud Run の実行時環境変数は変えない（既存の値を引き継ぐ）。stg はテストモード常時有効（`_TEST_MODE=true`）

## 付けた権限

Artifact Registry `tr-game-streamer` の `roles/artifactregistry.reader`、`roles/datastore.user`（E2E の後始末）、
`roles/firebasestorage.viewer`（プロジェクト）、`roles/storage.objectAdmin`（stg バケット）。

## 回避していること

- `gcloud builds submit` は `--gcs-source-staging-dir gs://tr-game-streamer-stg_cloudbuild/source` を明示（既定バケットの確認で権限エラー）
- Storage ルールは firebase-tools ではなく Firebase Rules API で反映（stg では `defaultBucket.get` が 404）

## 関連

- [[stgとE2Eの同時実行]]・[[ステージング環境運用方針]]・[[auto modeの本番操作制限]]
