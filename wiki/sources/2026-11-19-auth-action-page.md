---
title: メール内リンクの受け口 /auth/action とメールアドレス変更の流れ表示
type: source
date: 2026-11-19
updated: 2026-11-19
---

# メール内リンクの受け口 /auth/action とメールアドレス変更の流れ表示

PR #63（2026-11-17 起票、2026-11-19 マージ）。PR #58 のメールアドレス変更を stg で試したユーザーから、「確認メールのリンク先が Firebase 標準の白い画面（ロゴなし）でフィッシングに見える」「メール文面が定型文」「変更画面で全体の工程が分からない」と指摘があった。仕様は ログイン仕様書 §9.4・§9.5、設定 仕様書 §4.3、共通UI §2.11。

## 変更

- `/auth/action`（`app/(auth)/auth/action/page.tsx`、`lib/auth-action-shared.ts`）: Firebase のメール内リンクを受けるページ。認証画面と同じレイアウト（ロゴのヘッダー）。mode ごとに処理する。
  - `verifyAndChangeEmail`: 開いた時点で変更を確定し、完了画面と「新しいメールアドレスでログインする」。変更前のアドレスでこのブラウザにログイン中ならログアウト
  - `recoverEmail`: 開いただけでは戻さず、ボタンで戻す。戻した後にパスワード再設定メールを勧める
  - `resetPassword`: 新しいパスワードの入力画面（これまで Firebase 標準画面だったものを自前に）
  - `verifyEmail`: 受け口のみ（現状このメールは送っていない）
  - 無効なリンク（期限切れ・使用済み・mode/コードなし）は「このリンクは使えません」＋やり直し先のボタン
- メールアドレス変更モーダルの上部に「① 申し込む → ② メールのリンクを開く → ③ ログインし直す」（提案のステップ表示 `ProposalSteps` を流用し `ariaLabel`・`testId` を追加）
- 画面下のリンクは「TOP」。失敗の印は丸の中に「!」だけ（`AlertIcon` は自身が丸を含むため使わない）
- 単体テスト `tests/unit/auth-action-shared.test.ts`、E2E `e2e/auth-action.spec.ts`（無効リンク5パターン）と `e2e/email-change.spec.ts`（流れ表示）。stg で 20件中19件成功・1件スキップ（アカウントを作るテストは desktop のみ）

## ユーザー決定

- メール件名でプレミテを出すときは、末尾に「 | プレミテ」（【プレミテ】は使わない）
- メール送信元を puremite.net のアドレスにする（DNS 設定）は今はやらず、Notion チケット化（担当＝自分）
- Firebase の設定が通らなかったため、このPRは先にマージし、メール側は別チケットで切り分ける（2026-11-19）

## 未完了（重要）

- **Firebase Console のアクション URL を `/auth/action` にできていない。** stg（Identity Platform にアップグレード済み・Blaze）で、画面でも Identity Toolkit Admin API v2 でも `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` になる。メール本文の欄は灰色で編集不可。公式資料には原因の記述が見つからず、「カスタムドメインか SMTP 設定が要るのでは」は未確認の推測。
- そのため、**実際のメールのリンクは今も Firebase 標準の白い画面に行く**。`/auth/action` は URL を変えられるまで使われない。有効なコードでの完了画面は、Firebase の応答を差し替えたローカル確認までで、本物のメールでは未確認。
- メール文面・件名・差出人名の案は共有ファイル `plans/メール文面/Firebaseメールテンプレート-文面と設定手順.md`。
