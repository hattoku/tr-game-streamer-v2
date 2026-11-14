---
title: 本番デプロイ（2026-10-24 以降の変更をまとめて反映）
type: source
date: 2026-11-11
updated: 2026-11-14
commit: 1525320
---

# 本番デプロイ（2026-10-24 以降の変更をまとめて反映）

2026-11-11、main `1525320`（PR #26 まで）を本番へ。手順は `/mnt/project-files/plans/本番デプロイ-確認チェックリスト.md`（第2版）。
本番はクラウドからは行わず、ユーザーが手元の PowerShell で実行した。

## 流れと結果

- 戻し先: 旧リビジョン `puremite-00018-5p9`（2026-10-22）。新リビジョン `puremite-00019-bcr`
- A-7: Storage ルールを単独で試す → 本番では firebase-tools の storage デプロイが成功（stg の 404 は本番では起きない。`deploy.ps1` は直さなくてよい）
- A-9: **移行を先に適用**（`node scripts/migrate-listing-status.mjs --target=prod`、ADC 認証）。本番の再生リスト3件をすべて `listed`、掲載チャンネル3件 active。バックアップ（A-8）は件数が少ないため省略
- B: `deploy.ps1 prod`。インデックスの削除は No
- D: Cloud Scheduler `channel-popularity-daily`（4:00）・`purge-inquiry-attachments-daily`（4:30）を作成、`refresh-new-videos-daily`（6:00）を `--attempt-deadline 300s` に
- E-1: 掲載チャンネル候補のうち確実な38件を追加（登録済み40件）。UC ID で追加すると1件1ユニット（名前の特定は約101ユニット）

## ハマりどころ

- PowerShell は実行ポリシーで `gcloud.ps1` が止まるため、`gcloud.cmd`・`firebase.cmd` で案内する。`"--off=UC..,UC.."` は引用符で囲む（カンマ対策）
- ジョブ作成時に `CRON_SECRET` がチャットに出たため同日ローテーションした（`.env.local`・本番 Cloud Run・3ジョブ）。stg の Cloud Run は次の `deploy.ps1 stg` で更新される
- 本番の「ゲームから探す」で画像が出なかったのは、本番の `games` 5件が `packageImageUrl: null`（`scripts/backfill-package-images.mjs` を stg にしか流していなかった）。`npm run backfill:package-images:prod -- --apply` で解決。コード変更なし

## 関連

- [[掲載状態と検索面]]・[[auto modeの本番操作制限]]・[[2026-09-20-phase4.5-step7-partial]]（前回の本番デプロイ）
