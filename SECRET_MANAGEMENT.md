# 秘密情報の管理方針

## 現在の方針（開発フェーズ）

開発・共有の利便性のために、以下の秘密情報をソースコードに直接記述しリポジトリに含めている。

| ファイル | 内容 |
|---------|------|
| `lib/firebase.ts` | Firebase 認証情報 |
| (Cloud Run 設定) | `STAGING_BASIC_AUTH_USER` (Basic認証。変数名の"STAGING_"は導入時の名残で、検証段階のため本番にも同じ値を設定している) |
| (Cloud Run 設定) | `STAGING_BASIC_AUTH_PASSWORD` (Basic認証。同上) |

新たに秘密情報を追加する場合も、同様の構成ファイルに追加する。

**例外**: `YOUTUBE_API_KEY`・`CRON_SECRET`（`lib/constants.ts`）はこのリポジトリがpublicであるため
ソースへの直書きは採らない。ローカル開発は`.env.local`（gitignore対象）から供給し、Cloud Runデプロイ時は
`deploy.sh`/`deploy.ps1`が`.env.local`から読み取って`gcloud run deploy --update-env-vars`で
Cloud Runの環境変数として注入する。`CRON_SECRET`はCloud Schedulerが
`app/api/admin/refresh-new-videos`を呼ぶ際の`X-Cron-Secret`ヘッダー認証用（フェーズ4.5ステップ4）。

## 本番環境での管理

本番環境ではすべての秘密情報を **GCP Secret Manager** で管理する。Cloud Functions からは Secret Manager 経由でアクセスする。詳細は `document/specification/common/技術スタック仕様書` を参照。
