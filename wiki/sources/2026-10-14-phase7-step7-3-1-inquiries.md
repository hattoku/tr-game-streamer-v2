---
title: フェーズ7 ステップ7-3-1 — お問い合わせフォームと管理画面
type: source
date: 2026-10-14
updated: 2026-10-14
---

# フェーズ7 ステップ7-3-1 — お問い合わせフォームと管理画面

フェーズ7（友人デモ前の最低ライン）の 7-1 静的ページ・7-2 パスワード再設定に続く 7-3 お問い合わせの前半。
根拠仕様書は「ページ お問い合わせフォーム仕様書」「管理 お問い合わせ管理仕様書」、Firestore データモデル設計書 §3.17。

## ユーザー決定事項（着手時）

- **2分割**: 7-3-1 = `/contact` フォーム＋管理画面の一覧・詳細（ステータス・対応メモ・返信・クローズ/再オープン）。
  7-3-2 = `/contact/history`・ユーザー側スレッド・ユーザー返信・再オープン・返信のサイト内通知
- **メール通知（Resend）は見送り**。管理者はダッシュボードの未対応件数で新着を把握し、ゲストへの返信は管理画面の mailto から手動
- 管理一覧の日付範囲絞り込み・表示件数切替は作らない

## 実装内容

- データモデル v1.19 §3.17 を先に改訂: `subject` 削除（フォームに件名欄が無い）、`body`・`relatedUrls` 追加、`status` を
  `open`/`in_progress`/`on_hold`/`resolved`（resolved がクローズを兼ねる）、`userName` はゲスト null。最初の内容は `inquiries.body` のみに置き、
  `messages` には返信だけ入れる（スレッド表示で body を先頭メッセージとして出す）
- `lib/inquiry-shared.ts`: 種別・ステータスの定義と `validateInquiryInput`（フォームと API で共有、仕様 §6 の文言）。`profile-shared.ts` と同じ形
- `POST /api/inquiries`（ログイン任意、`getOptionalUid`）: ログイン済みはメール・表示名をサーバー側（Auth / `users`）から取る。
  アカウントにメールが無い場合だけ入力値を返信先にする（`requireEmail`）
- `PATCH /api/admin/inquiries/[inquiryId]`（`requireAdmin`）: workflows と同じ action 方式（update_status / update_memo / reply / close / reopen）。
  未対応で返信すると対応中へ自動遷移、保留中は維持、クローズ済み・ゲストへの返信は 409、メモ1,000字超は 400
- `firestore.rules`: `inquiries`・`messages` を `allow write: if false`（API Route のみ）。stg/本番反映は次回 `deploy.ps1`
- 画面: `components/contact/ContactForm.tsx`（URL 1〜5件の行追加・削除、行ごとに安定 key、完了画面へフォーカス移動）、
  `/admin/inquiries`（全件クライアント取得、種別・ステータス・キーワード、20件ページング、カード表示）、
  `/admin/inquiries/[inquiryId]`（`onSnapshot` 購読＋エラー表示、mailto、スレッドは左右寄せ、クローズ確認 Modal）
- `SelectMenu` に `placeholder`・`id`・`aria-invalid`・`aria-describedby` を追加（`Field` と組み合わせて使えるように）
- 導線: 管理ナビ「お問い合わせ」、ダッシュボードの未対応件数カード、設定ページ末尾のお問い合わせカード（履歴ボタンは 7-3-2）

## レビュー（dev-orchestrator → spec・design）

dev-orchestrator は配下の2エージェントをバックグラウンドで起動したまま結果を待たずに戻ったため、spec-conformance-reviewer と
design-consistency-reviewer を直接も実行した（後から orchestrator 側の結果も届き、計4本）。対応したもの:
- **高（申し送り）**: rules はフィールド単位で読み取りを制限できないため、7-3-2 でユーザーが自分の `inquiries` を購読すると `operatorMemo` も渡る。
  7-3-1 では実害なし。7-3-2 着手前に「メモの分離」か「サーバー経由取得」を決める（仕様書 §1.1・§3.17 に明記）→ [[firestoreセキュリティルール方針]]
- 戻るボタンを `LinkButton` に、詳細の `onSnapshot` にエラー時の表示、ログイン済みメール欄の文字色を `read-only:` variant に（`cn` に tailwind-merge が無いため）、
  関連URLを `fieldset`/`legend` に、完了文言を仕様 §7 どおりに、メール無しアカウントの扱い、メモ上限の 400 化
- 仕様書: 設定 §1.2 の自己矛盾、管理仕様 §1.1 に一覧のカード表示・メモの編集方式・絞り込み文言・返信時の挙動を追記、ダッシュボードのリンクがクエリ無しであること、トレーサビリティ2行追加

## 確認

lint / tsc / build 成功（build は dev サーバー停止後）。ローカル stg ＋ `scripts/dev/screenshot.mjs`（Playwright MCP のブラウザが別セッションで使用中だったため）で、
ゲスト・一般ユーザーの送信、バリデーション、管理者の一覧〜返信〜クローズ〜再オープン、一般ユーザーの `/admin` 拒否、未認証 PATCH 401、存在しない ID の 404、
390/768/1440px で横スクロール無しを確認。確認用の `inquiries` 3件は stg から削除済み。

## メモ

- `scripts/dev/screenshot.mjs` の `click` は文字列を含む button/a を押すだけなので、Radix の DropdownMenu は `eval` で `pointerdown` を投げて開く。
  ログイン中はヘッダーのユーザーメニューも `aria-haspopup=menu` なので、`form button[aria-haspopup=menu]` のように絞ること
- リポジトリに prettier 設定は無い。整形する場合は `--single-quote --print-width 140` で既存スタイルに合う
- 仕様書の一部（ダッシュボード・設定）は末尾改行が無く、`>>` で追記すると行が連結する
