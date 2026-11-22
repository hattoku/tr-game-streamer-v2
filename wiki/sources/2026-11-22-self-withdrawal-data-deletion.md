---
title: 本人の退会＝本人の作成データとアカウントの消去（再開の廃止）
type: source
date: 2026-11-22
updated: 2026-11-22
---

# 本人の退会＝本人の作成データとアカウントの消去

PR #69（2026-11-22 マージ）。Notion チケット「本人が退会した場合は、本人の作成データは残さず消去する」。PR #64 の「本人の退会＝残して締め出し、同じメール・パスワードでログインすれば再開」を置き換えた。仕様は ページ 設定 仕様書 v1.13 §8、ログイン仕様書 v1.12 §5.5・§5.6、管理 ユーザー管理仕様書 v3.1 §3.0、Firestore データモデル設計書 v3.5（§7.1・§3.38・§3.39）。管理者が退会させる場合は従来どおり締め出し（データは残す）。

## 変更

- 消去処理は新規 `lib/account-delete-server.ts` の `deleteAccountAndData`。`POST /api/account/withdraw` が呼ぶ（`confirm: true` 必須、無ければ 400）
- 消すもの: レビュー（付いた `helpful_votes` ごと）、本人が押した `helpful_votes`（相手の `helpfulCount`・`trustScore`・投稿者の `helpfulReceivedCount` を1戻す。数の戻しと票の削除は1トランザクション）、`mylist`・`watch_progress`・`watch_history`・`playlist_viewers`・`notifications`・`saved_collections`・`collections`・`inquiry_upload_counters`・`game_link_counters`・`fraud_alerts`、`inquiries`（`messages`・Storage の添付画像）、Storage の `avatars/{uid}/`、`admin_user_records`、`users`、Firebase Auth。消えたレビューの再生リストはスコアと件数を計算し直す
- 残して本人を外すもの: 審査済みの `workflows`（`submittedBy` を空に。審査中の提案と本人のレビューへの審査中の通報は消す。通報で非表示にしたレビューの内容の控え `hiddenReviewSnapshot` は消す）、`playlists.proposedBy`・`tags.createdBy`・`playlist_game_changes.userId`（null）、`operation_logs` の `targetId`・`targetName`（空）
- 退会の理由は UID なしで `withdrawal_reasons` に保存（`firestore.rules` は管理者のみ読み取り）。今は管理画面から見られない
- やり直し: 消す前に再計算する再生リストとレビューIDを `account_deletions/{uid}` に控え、失敗したらもう一度「退会する」で続きから消す。順番は users を先、Firebase Auth を最後（Auth が残っていれば users が無くても再実行できる。API は users が無くても進める）。終わったら控えを消す
- 退会モーダル `components/settings/WithdrawModal.tsx` は2段階。①消えるものの一覧と理由（任意）→ ②チェックと「退会」の入力が揃うまで実行できない。403 のときは「このアカウントは退会できません」
- 廃止: `POST /api/account/resume`、`requireSignedInIncludingWithdrawn`、`suppressWithdrawnGateFor`、アカウント作成で使用中のアドレスのとき同じパスワードでログインする動き（「すでに登録されています」だけ出す）
- `WithdrawnAccountGate` は管理者の退会の案内だけ。2026-11-22 より前に本人が退会したアカウント（`withdrawnBy = self`）には「以前の方式で退会したアカウントです。…お問い合わせください」を出す（データは残っており、管理者が解除できる）
- 消去済みのメールアドレスは新しいアカウントとして作れる（以前のデータは戻らない）

## ユーザー決定

- 本人の退会はデータを残さず消去する（レビューは本人の記録なので消去の意思を尊重する）。退会操作では、データが消えることを念入りに案内する

## 実装メモ（Claude の判断）

- 審査済みの提案・操作ログは、運営の記録として残し、本人を特定できる項目だけ外す（全部消すと審査の履歴が欠けるため）
- 消去前の確認を2段階にしたのは、Firebase Auth まで消えて取り消せないため
- テスト: `e2e/user-management.spec.ts` に本人の退会の3件（消去の確認・confirm なしの拒否と「戻る」・管理者の退会済みアドレスの再登録）。stg で user-management と smoke の116件中116件成功
- 未対応: 退会の理由を見る管理画面、旧方式で退会済みの本人アカウントの移行（管理者が解除→本人が再度退会）
