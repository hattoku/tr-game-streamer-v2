---
title: ローカル開発のデフォルト接続先をstgに反転（lib/app-env.ts新設）とデプロイ/設定の掃除
type: source
date: 2026-09-20
updated: 2026-09-20
---

# ローカル開発のデフォルト接続先をstgに反転（lib/app-env.ts新設）とデプロイ/設定の掃除

ユーザーからの「stgと本番でDBが共通になっていないか」という確認を受けた調査と、その結果
判明した「ローカル開発のデフォルトが本番Firestore」問題の修正。HANDOFF.md未解決事項13。

## 調査結果: DBは分離済み、「共通」の正体は別

Firestore/Auth/Cloud Run/HostingはGCPプロジェクト単位（`tr-game-streamer-stg` /
`tr-game-streamer`）で最初から分離されており、[[ステージング環境運用方針]]の棚卸しで
ルール・インデックス・Authプロバイダも一致確認済みだった。「共通」に見えていたのは:

1. **`NEXT_PUBLIC_APP_ENV`未指定時の接続先が本番**だったこと。`lib/firebase.ts`・
   `lib/firebase-admin.ts`が`isStg = APP_ENV === 'stg'`で判定していたため、`npm run dev`は
   本番Firestoreに向いていた。フェーズ1〜4.5のE2E確認はすべてこの経路で本番に対して行われ、
   HANDOFF.mdに「テストデータ削除済み、本番DBへの影響は残っていない」が繰り返し出てくるのは
   その痕跡。`.env.local`の`NEXT_PUBLIC_TEST_MODE=true`も本番Authに対して使い捨て会員を作る
   状態だった。
2. **シークレット（`YOUTUBE_API_KEY`・`CRON_SECRET`・Basic認証）がstg/本番で同一**。
   `deploy.ps1`が同じ`.env.local`から両環境に注入している。YouTube Data APIのクォータ共有が
   実害候補。当面は対応不要とユーザー判断、備忘録のみ（HANDOFF.md未解決事項13）。

## 変更内容

- **`lib/app-env.ts`新設**: 環境判定を一箇所に集約。
  `APP_ENV = NEXT_PUBLIC_APP_ENV === 'prod' ? 'prod' : 'stg'`、`IS_PROD`、
  `TEST_MODE_ENABLED = !IS_PROD && NEXT_PUBLIC_TEST_MODE === 'true'`をexport。
  **明示的に`prod`と指定しない限りstg**に倒す（安全側デフォルト）。
- `lib/firebase.ts`・`lib/firebase-admin.ts`: `isStg`のローカル判定を廃止し`IS_PROD`をimport。
- `components/layout/TestModeWidget.tsx`・`app/api/test/sign-in/route.ts`: 各自で
  `process.env.NEXT_PUBLIC_TEST_MODE`を見ていたのを`TEST_MODE_ENABLED`に統一。本番向けビルドでは
  `_TEST_MODE=true`を渡しても無効になる。
- `package.json`: `dev`/`build`=stg（未指定）、`dev:prod`/`build:prod`=本番に変更。
  `dev:stg`/`build:stg`は廃止。
- `.agent/rules/setup.md`を全面書き換え、HANDOFF.mdフェーズ5方針の
  「`npm run dev`（ローカル→本番Firestore接続）」をstgに修正。

## 同セッションの掃除（D）

- **`deploy.ps1`/`deploy.sh`にFirestoreルール・インデックスのデプロイを組み込み**。手順2として
  Cloud Runデプロイの前に`firebase deploy --only firestore:rules,firestore:indexes --project <id>`を
  実行する（新コードが依存するルール/インデックスを新リビジョンが載る前に反映するため）。
  stgで実行して確認済み。非対話ではリポジトリに無いインデックスを削除しないので、prodの旧
  `reviews`インデックスはこれでは消えない。
- **Firebase Webアプリ設定の直書き一本化**。`lib/firebase.ts`の
  `process.env.NEXT_PUBLIC_FIREBASE_* || "..."`（および`NEXT_PUBLIC_STG_FIREBASE_*`）による
  上書きを廃止しハードコードのみに。整理中に`.env.local`の本番`APP_ID`/`MEASUREMENT_ID`が
  ハードコード値（＝Cloud Runで動いている値。cloudbuild.yamlはこれらを渡していない）と違って
  いることが判明。リセット（コミット`20e51ea`）前の旧Webアプリ登録のIDが残っていたと推定
  （apiKeyはプロジェクト共通なので一致していた）。Firestore/Authの動作には影響しないが、
  設定源が二重化してドリフトしていた実例。
- 併せてDockerfileの`NEXT_PUBLIC_FIREBASE_*`の`ARG`/`ENV`（cloudbuild.yamlから渡されておらず
  死んでいた）、`.env.local`の同変数、`.env.stg`、`.gitignore`の`.env.stg`行を削除。

## 確認したこと・ハマりどころ

- `npx tsc --noEmit`・`npm run lint`・`npm run build`成功。
- **ビルド成果物でのインライン化の挙動**: `NEXT_PUBLIC_APP_ENV`をビルド時に未設定にすると、
  Turbopackはクライアント側は`process.env`ポリフィル経由・サーバー側は`process.env`の実行時参照の
  まま残す（値が無いので置換対象にならない）。いずれも実行時に`undefined`→`stg`に解決されるため
  安全側で一致する。Cloud Runデプロイは`cloudbuild.yaml`の`_APP_ENV`→Dockerfile builderステージの
  `ENV NEXT_PUBLIC_APP_ENV`でビルド時に値が存在するため、こちらは従来通りインライン化される。
  Dockerfileのrunnerステージには`NEXT_PUBLIC_APP_ENV`が無いが、builderで焼き込まれるので問題ない。
- リポジトリはCRLF/LF混在（`lib/firebase.ts`はCRLF、`package.json`等はLF）。Nodeスクリプトで
  一括置換する際は改行コードを吸収する必要があった。

## 残課題

HANDOFF.md未解決事項13に集約。本番→stgのデータコピー手段（後日、ユーザー判断）と
`scripts/lib/firebase-admin.mjs`の名前付きApp化（実害なし）。

## 関連
- [[ステージング環境運用方針]]
- [[2026-09-20-phase4.5-step7-partial]]（stg棚卸し）
