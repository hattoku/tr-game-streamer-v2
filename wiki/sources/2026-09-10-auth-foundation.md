---
title: 認証まわりの実装土台（AuthContext・ログインテストページ・初期role付与API）
type: source
date: 2026-09-10
updated: 2026-09-10
commit: 未コミット
---

# 認証まわりの実装土台

HANDOFF.mdフェーズ1の最後の項目「認証まわりの実装土台」を実装した。ユーザーとスコープを
すり合わせ、フル仕様（`document/specification/page/ページ ログイン アカウント登録・
ログイン仕様書.md`）のうち、ソーシャルログイン・パスキー・パスワード再発行・初期設定
ウィザード（ジャンル/タイトル選択・マイリスト追加）は今回スコープ外とした
（`games`・マイリスト機能が未実装のため動かせない）。今回の実装は「ログイン中/
ログアウト中を切り替えて確認できる最小限の土台」。

## 決定事項（ユーザーに確認済み）

1. **実装範囲**: ログイン/ログアウトのテスト用ページ + Custom Claims初期role付与のみ。
   プロフィール設定・ジャンル/タイトル選択・マイリスト追加はフェーズ2でmylist機能と
   合わせて実装。
2. **Custom Claims初期付与の方式**: Next.jsのAPI Route（Admin SDK）を採用。
   `firestore.rules`冒頭コメントは「Cloud Functions経由」を前提としていたが、
   Cloud Functions基盤（`functions/`ディレクトリ・`firebase-functions`依存）は
   このプロジェクトに存在しないため、新規導入コストを避けて既存のNext.js on Cloud Run
   にそのまま乗る方式にした。**`firestore.rules`冒頭コメントの「Cloud Functions経由」
   という記述は実態と異なるため、後で修正が必要**（Firestoreルール自体の変更ではなく
   コメントのみなので、次回ルール変更時にでも直せばよい）。
3. **ソーシャルログイン**: 今回は未実装（メール/パスワードのみ）。Google・Xは
   HANDOFF.md未解決事項4（X認証・パスキーは意図的に保留）の対応と合わせて別途実施。

## 追加したファイル

- `lib/firebase.ts` — `auth`（Firebase Auth クライアントSDK）をexport追加
- `lib/firebase-admin.ts` — サーバー専用のAdmin SDK初期化（`NEXT_PUBLIC_APP_ENV`で
  prod/stg切り替え、ADC認証。`scripts/lib/firebase-admin.mjs`と同方針）
- `contexts/AuthContext.tsx` — `onAuthStateChanged`でuser/roleを追跡するReact Context。
  roleはFirebase Auth Custom Claimsから取得（`getIdTokenResult()`）
- `app/api/auth/init-user/route.ts` — サインアップ直後にクライアントから呼ぶAPI
  Route。IDトークンをAdmin SDKで検証し、初回のみCustom Claims `role: 'user'`を設定、
  `users/{uid}`ドキュメントを作成する。**role未設定の場合のみ**書き込むため、
  管理者が後からoperator/ownerに昇格させても、このAPIの再呼び出しで巻き戻らない
- `app/login/page.tsx` — 動作確認用の最小ページ。メール/パスワードでの
  ログイン・新規登録・ログアウトのみ（バリデーション・スタイリングは仕様書通りではない）
- `app/layout.tsx` — `AuthProvider`でchildren全体をラップ

## ユーザー作成時のFirestoreドキュメントについて

`Firestore データモデル設計書.md`3.1節の`users`スキーマは`displayName`必須だが、
プロフィール設定ステップ（初期設定フローStep1）は今回スコープ外のため、
メールアドレスのローカル部分を仮のdisplayNameとして設定している。初期設定フロー
実装時に本来の入力値で上書きされる想定。`isMylistPublic`/`isReviewHistoryPublic`は
仕様書のデフォルト値（ON）をそのまま使用。

## 動作確認

ローカル`next dev`でビルド・型チェックを確認した上で、ブラウザ操作の代わりに
Firebase Auth REST API + curlで本番環境に対してEnd-to-Endの検証を行った
（テストユーザーは確認後にAuth・Firestoreの両方から削除済み）。

1. `accounts:signUp` でテストユーザー作成 → IDトークン取得
2. `/api/auth/init-user` にIDトークンを渡して呼び出し → `{"role":"user"}` 200
3. 同じトークンで再呼び出し → 同じ結果（Custom Claims上書きされない冪等性を確認）
4. トークンなしで呼び出し → 401 `missing bearer token`
5. Admin SDKで直接確認 → Custom Claims `{"role":"user"}` が実際に設定され、
   `users/{uid}`ドキュメントも仕様通りのフィールドで作成されていることを確認

## 副次的な発見: ステージングのAuthenticationが未設定

上記4のcurl検証を最初ステージング（`tr-game-streamer-stg`）に対して行ったところ、
Firebase Auth REST APIから`CONFIGURATION_NOT_FOUND`エラーが返った。これは
HANDOFF.md未解決事項5「ステージング環境のリセット」が示す通り、ステージングの
Authentication（メール/パスワードプロバイダ等）がまだ有効化されていないことを
実際に確認できたということ。[[ステージング環境運用方針]]で合意した「Authプロバイダ
有効化は本番と都度同時にやる」対応がまだ未実施であることが裏付けられた。

## 関連
- [[ステージング環境運用方針]]
- [[firestoreセキュリティルール方針]]
- HANDOFF.md フェーズ1ロードマップ（5. 認証まわりの実装土台）・未解決事項4・5
