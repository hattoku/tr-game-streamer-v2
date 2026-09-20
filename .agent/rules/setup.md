# 開発環境セットアップ

## 必須ツール

- Node.js 20.x 以上
- npm
- Firebase プロジェクト（認証情報は `lib/firebase.ts` に直接記述）

## 環境の切り替え（ステージング環境 / 本番環境）

本プロジェクトは本番（`tr-game-streamer`）とステージング（`tr-game-streamer-stg`）の2つの
Firebase/GCPプロジェクトを持ち、環境変数 `NEXT_PUBLIC_APP_ENV` で接続先を切り替える。
判定は `lib/app-env.ts` に集約されており、**`NEXT_PUBLIC_APP_ENV=prod` と明示したときだけ本番、
それ以外（未指定を含む）はすべてステージング**に接続する（2026-09-20に反転。以前は
「stgと明示しない限り本番」だったため、ローカルの `npm run dev` が本番Firestoreに向いていた）。

### 1. ステージング環境向け（デフォルト）
標準のコマンドを使用する。`NEXT_PUBLIC_APP_ENV` は未指定でよい。日常の実装・E2E確認はこちら。

- **開発サーバー起動**:
  ```bash
  npm run dev
  ```
- **ビルド**:
  ```bash
  npm run build
  ```

### 2. 本番環境向け（明示指定が必要）
本番Firestoreに接続したい場合のみ `:prod` サフィックスのコマンドを使用する。内部で
`NEXT_PUBLIC_APP_ENV=prod` が設定される。本番データを触るので、テストデータの作成・削除を伴う
確認には使わない。

- **開発サーバー起動（本番接続）**:
  ```bash
  npm run dev:prod
  ```
- **ビルド（本番向け）**:
  ```bash
  npm run build:prod
  ```

Cloud Run へのデプロイは `deploy.ps1 [stg|prod]` / `deploy.sh [stg|prod]` が `cloudbuild.yaml` の
`_APP_ENV` 経由で Docker ビルド時に `NEXT_PUBLIC_APP_ENV` を明示するため、上記スクリプトとは独立に
正しい環境が選ばれる。

### テストモードウィジェット
`NEXT_PUBLIC_TEST_MODE=true`（ローカルは `.env.local`）で有効になるテストモードウィジェットと
`/api/test/sign-in` は、`lib/app-env.ts` の `TEST_MODE_ENABLED` により**本番以外でのみ**有効。
本番向けビルド（`NEXT_PUBLIC_APP_ENV=prod`）では変数が渡されていても無効になる。

> **実装時の注意**: アプリケーションコード内で環境による分岐が必要な場合は、
> `process.env.NEXT_PUBLIC_APP_ENV` を直接参照せず、`lib/app-env.ts` の `IS_PROD` / `APP_ENV` を
> import して判定すること。
