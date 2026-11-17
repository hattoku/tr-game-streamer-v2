---
title: 設定ページからメールアドレスを変更する
type: source
date: 2026-11-17
updated: 2026-11-17
---

# 設定ページからメールアドレスを変更する

PR #58（2026-11-17）。Notion チケット「設定からメールアドレス変更ができるようにする」。仕様は ページ 設定 仕様書 v1.10 §4.3。

## 変更

- 設定の「アカウント」カードに、現在のメールアドレス（全文）と「変更する」ボタン
- モーダル「メールアドレスを変更する」（`components/settings/EmailChangeModal.tsx`）: 新しいメールアドレス／確認用／現在のパスワード。入力チェックは `lib/email-change-shared.ts`（空欄・形式・不一致・現在と同じ）
- 送信の流れ: 入力チェック → パスワードで再認証 → `POST /api/account/email/check` で使用中でないか確認 → `verifyBeforeUpdateEmail` で新しいアドレスへ確認メール → 「確認メールを送信しました」
- `POST /api/account/email/check`: ログイン必須、再認証から10分以内のトークンだけ、1人10分10回まで。Admin SDK で使用中かを調べる
- `POST /api/account/email/sync`: `users/{uid}.email` のミラーを Auth に合わせる。設定ページを開いたときにずれていれば呼ぶ。例外はログに残す

## ユーザー決定

- モーダルに「現在のパスワード」欄を足す（Firebase が直前の本人確認を求めるため。仕様に追加）

## 実装メモ（Claude の判断）

- stg・本番の Firebase Auth はメールアドレス列挙保護が有効で、使用中のアドレスでもクライアントの送信がエラーにならない（stg で確認）。そのためサーバーで使用中かを確かめる
- 確認メールの送信元は Firebase 既定の noreply@〜.firebaseapp.com で、迷惑メールに入ることがある
- E2E: `e2e/email-change.spec.ts`（表示・入力チェック・パスワード違い／使用中／送信成功・未ログインの確認 API）。アカウントを作るテストは desktop だけ。stg で9件成功・1件スキップ（2026-11-17）
