---
title: お問い合わせへの画像添付
type: source
date: 2026-10-28
updated: 2026-11-14
commit: 072a228
---

# お問い合わせへの画像添付

PR #11（`072a228`、2026-10-28 main へ）。仕様は ページ お問い合わせフォーム仕様書 §9（新設）ほか、データモデル §3.17・§3.31、技術スタック §2.12。
計画は `/mnt/project-files/plans/お問い合わせ画像添付-実装計画.md`。

## ユーザー決定（2026-10-25）

- ログイン済みのみ、最初の送信とスレッドの返信の両方。1回3枚・1枚5MB・1日20枚（送信と返信の合計）
- PNG・JPEG・WebP だけ（SVG 不可）。本人と管理者だけが見られる。対応済みから180日で画像だけ削除
- サムネイル＋クリックで拡大。ダウンロードボタンは置かない

## 実装

- `POST /api/inquiries` と `POST /api/inquiries/[id]`（返信）が multipart を受け付ける。ゲストの添付は 400
- 先頭バイトで形式を判定し、`sharp` で描き直してメタデータ（位置情報など）を消す。長辺4,096px・4,000万画素まで。`sharp` は dependencies へ移した
- 1日の上限は `inquiry_upload_counters` を、お問い合わせの書き込みと同じトランザクションで加算
- Storage は `storage.rules` で全拒否。閲覧は本人用・管理者用の API だけで、Firestore に未削除の記録がある画像だけ返す（`lib/inquiry-attachments-server.ts`）
- `resolvedAt` を記録し、`POST /api/admin/inquiries/purge-attachments` を Cloud Scheduler（`purge-inquiry-attachments-daily`、4:30）から毎日呼んで削除
- UI: `AttachmentPicker`（フォーム・返信欄）、`InquiryAttachments`（履歴・管理画面で共用）
- `firestore.indexes.json` に `hasAttachments`＋`resolvedAt` の複合索引

## ハマりどころ

- Storage は無料枠のため US-EAST1（asia-northeast1 は選べなかった）。stg・本番とも US-EAST1
- 新しい複合索引はデプロイ直後しばらく作成中で、削除 API が 500 になる（作成完了後は正常）
- クラウドからの `storage.rules` デプロイは firebase-tools では通らない → [[クラウドからのstgデプロイ]]

## 関連

- 前段: [[2026-10-24-phase7-step7-3-2-inquiry-history]]
