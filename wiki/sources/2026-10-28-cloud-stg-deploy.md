---
title: クラウド環境から stg へデプロイするスクリプト
type: source
date: 2026-10-28
updated: 2026-11-14
commit: e2a02ae
---

# クラウド環境から stg へデプロイするスクリプト

PR #6（`5c54d6f`、2026-10-25）と PR #13（`e2a02ae`、2026-10-28）。HANDOFF.md にも手順と付与した権限を書いた。

## PR #6: `scripts/deploy-stg-cloud.sh`

- クラウドセッション（Claude Code on the web）から stg へデプロイする bash 版。stg 専用で、鍵の `project_id` が stg であることを確かめてから動く。本番はクラウドからは行わない（ユーザー判断）
- 認証は環境変数 `GCP_SA_KEY_STG_B64`（SA `claude-stg-deployer` の鍵を base64 1行に）。鍵と gcloud 設定は一時ディレクトリに置き、終了時に消す
- Cloud Run の実行時環境変数は変えない（既存リビジョンの値を引き継ぐ）
- `gcloud builds submit` は既定バケットの確認で権限エラーになるため `--gcs-source-staging-dir` を明示。`--async` で投げてポーリング

## PR #13: Storage ルールを Firebase Rules API で直接反映

- `claude-stg-deployer` に `roles/firebasestorage.viewer`（プロジェクト）と `roles/storage.objectAdmin`（stg バケット）を付けても、firebase-tools の storage デプロイは失敗した。
  firebase-tools は既定バケットを `firebasestorage.defaultBucket.get` で取りに行き、これが404を返すため（バケット自体は存在して一覧にも出る）
- Storage ルールだけ、ルールセットを作って stg のバケット `tr-game-streamer-stg.firebasestorage.app` のリリースを差し替える形にした。Firestore のルール・インデックスは firebase-tools のまま
- 本番用の `deploy.ps1` は変えていない。2026-11-11 の本番デプロイでは firebase-tools の storage デプロイが成功した（404 は stg だけの現象）

## 関連

- [[クラウドからのstgデプロイ]]（まとめ）・[[2026-10-28-inquiry-image-attachments]]
