---
title: ユーザー管理画面と、退会（アカウントを残してログインできなくする方式）
type: source
date: 2026-11-19
updated: 2026-11-19
---

# ユーザー管理画面と、退会（アカウントを残してログインできなくする方式）

PR #64（2026-11-19 マージ）。Notion チケット「ユーザー一覧ページ作成」。仕様は 管理 ユーザー管理仕様書 v3.0（第3章）、ページ 設定 仕様書 v1.11 §8、ページ ログイン アカウント登録・ログイン仕様書 v1.10 §5.5・§5.6、Firestore データモデル設計書 v3.4。計画と確認事項はプロジェクトファイル `plans/ユーザー管理/ユーザー管理と退会-計画（案）.md`。

## 変更

- 退会の定義を「物理削除」から「アカウントとデータを残し、ログインできなくする」に変えた。`users` に `accountStatus`（`active`/`withdrawn`）・`withdrawnAt`・`withdrawnBy`（`self`/`admin`）・`withdrawReason`・`restoredAt`。処理は `lib/account-status-server.ts`（`withdrawAccount`・`restoreAccount`・`writeOperationLog`）、型と純粋関数は `lib/account-status-shared.ts`
- 本人の退会: 設定ページの「退会」カード → `components/settings/WithdrawModal.tsx` → `POST /api/account/withdraw`。管理者には出さず、テスト用会員は押せない
- 退会中のログイン: `components/layout/WithdrawnAccountGate.tsx`（ルートレイアウト）が `AuthContext` の `accountStatus`・`withdrawnBy` を見て確認を出す。本人の退会なら「利用を再開しますか？」→ `POST /api/account/resume`、管理者の退会なら再開できずお問い合わせを案内。閉じたらログアウト
- アカウント作成で `auth/email-already-in-use` のとき、同じパスワードで `signInWithEmailAndPassword` を試す（退会中なら上の確認へ）。違えば「退会済みのアカウントは以前のパスワードでログインすると利用を再開できます」
- 締め出し: `lib/api-auth.ts` の `requireUser`・`requireUserWithRole` が退会中を 403 `account_withdrawn`（管理者は調べない）。再開 API だけ `requireSignedInIncludingWithdrawn`。`firestore.rules` に `isActiveAccount()` を足し、本人の書き込み（users・reviews・helpful_votes・mylist・watch_progress・watch_history）を止める
- 隠す: 退会時に本人のレビューへ `reviews.isAuthorWithdrawn: true` を付け、`recalculatePlaylistScore`・人気の集計・「参考になった」・レビュー一覧（取得後に除外）から外す。公開プロフィールとアイコン配信は `isHiddenUser`（退会中か旧 `isBanned`）で 404
- 管理画面: ナビに「ユーザー」。`/admin/users`（一覧・絞り込み・20件ずつ・`components/admin/users/SignupChart.tsx` の新規登録推移グラフ）、`/admin/users/[userId]`（基本情報・名前と自己紹介の編集・アイコン削除・備考・退会させる／解除）。API は `GET /api/admin/users`、`GET|PATCH /api/admin/users/[userId]`、`DELETE …/avatar`、`POST …/note`・`…/withdraw`・`…/restore`。読み込みと操作は `lib/admin-users.ts`、サーバー側は `lib/admin-users-server.ts`
- 備考と管理者が退会させた理由は新しいコレクション `admin_user_records/{uid}`（管理者だけ読める、書き込みは API のみ）
- 操作ログ: 退会・解除・編集・アイコン削除を `operation_logs` に書く（閲覧画面は未実装）

## ユーザー決定

- 退会＝アカウントは残し、ログインできなくする（チケット本文）。メールアドレスは管理者から変更できない。メールの重複は不可
- 退会中はレビュー・プロフィール・公開マイリストを他の人から隠し、レビューはスコアからも外す。データは残し、再開で戻す
- 管理者が退会させたら本人では再開できない（BAN は別に作らずこれにまとめた）
- 管理者が編集できるのはユーザー名・自己紹介・アイコンの削除だけ（公開設定など本人の好みは触らない）
- 本人の退会はその場で行う（運営の承認は待たない）
- 一覧に管理者も印を付けて載せる。登録推移グラフは一般ユーザーだけ数える

## 実装メモ（Claude の判断）

- Firebase Auth のアカウントは無効化しない（無効化すると再開のときにパスワードを確かめられない）。退会時は `revokeRefreshTokens` でログイン中の端末を切る
- 最終ログインは `users.lastLoginAt` がどこからも書かれていなかったので、Firebase Auth の `lastRefreshTime`（無ければ `lastSignInTime`）を使う。一覧は Auth の `listUsers` と `users` を全件読み、絞り込みは画面側（件数が少ないうち）
- `isAuthorWithdrawn` は通報の `isHidden` と別の印にした（再開で通報の非表示まで戻さないため）。印付け・スコア再計算に失敗したら API をエラーにし、同じ操作をもう一度すると状態はそのままで印付けだけやり直す
- `reviews` はルール上は誰でも読める（`isHidden` と同じ）。隠すのは表示側
- 設定から退会した直後、`users` の購読が先に「退会中」を受けて再開の確認が一瞬出るのを、`suppressWithdrawnGateFor(uid)` で止める
- 設定ページの「未ログインなら /login へ」の転送が、退会・ログアウト後の TOP への移動より先に走っていた（stg の E2E で発見）。`leavingRef` で自分から離れるときは転送しない
- グラフは日本時間で区切る（週は月曜始まり）。1系列なので凡例なし、ホバー・タップで期間と人数、「表で見る」付き
- テスト: 単体 `tests/unit/account-status.test.ts`、E2E `e2e/user-management.spec.ts`（Firebase Auth の REST API で使い捨てアカウントを作り、最後に消す）。stg で 12件中12件成功
- 退会中のユーザーのマイリスト・視聴開始は人気の集計から外していない
