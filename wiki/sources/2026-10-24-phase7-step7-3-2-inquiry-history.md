---
title: フェーズ7 ステップ7-3-2 — お問い合わせ履歴とユーザー側スレッド
type: source
date: 2026-10-24
updated: 2026-11-14
commit: 0257ca6
---

# フェーズ7 ステップ7-3-2 — お問い合わせ履歴とユーザー側スレッド

コミット `0257ca6`・`20538cc`（2026-10-24）。main へは 2026-10-26 に 7-4 の PR #3（`bd874d4`）と一緒に入った。2026-11-14 に wiki の記録漏れの洗い出しで追記した。

## 変更内容

- `/contact/history`（一覧・未読表示）と `/contact/history/[inquiryId]`（スレッド・ユーザーの返信・再オープン）を追加
- 本人専用 API `GET /api/inquiries`・`GET|POST /api/inquiries/[inquiryId]`（Admin SDK）。`lib/inquiries.ts`・`lib/inquiry-shared.ts`
- 管理者の返信でサイト内通知（`inquiry_reply`）を作る。管理画面とダッシュボードに「ユーザー返信あり」（`awaitingAdminReply`）
- 送信完了画面・設定ページ・ユーザーメニューから履歴への導線

## 技術的な決定

- 7-3-1 から申し送られていた `operatorMemo` の秘匿は、**サーバー経由で取得**する方を採った（ユーザー決定）。
  `firestore.rules` で本人の `inquiries` 直接読み取りを閉じ、API がフィールドを選んで返す。→ [[firestoreセキュリティルール方針]]
- 旧クライアントは本人読み取りをしていないため、コードを先にデプロイしてから rules を反映する順なら問題ない

## 関連

- 前段: [[2026-10-14-phase7-step7-3-1-inquiries]]
- 続き（画像添付）: [[2026-10-28-inquiry-image-attachments]]
