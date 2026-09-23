# 秘密情報の管理方針

## 現在の方針（開発フェーズ）

開発・共有の利便性のために、以下の秘密情報をソースコードに直接記述しリポジトリに含めている。

| ファイル | 内容 |
|---------|------|
| `lib/firebase.ts` | Firebase 認証情報 |
| (Cloud Run 設定) | `STAGING_GATE_PASSWORD` (Cookieベースの共有パスワードゲート。変数名の"STAGING_"は導入時の名残で、検証段階のため本番にも同じ値を設定している。旧 `STAGING_BASIC_AUTH_USER`/`STAGING_BASIC_AUTH_PASSWORD` のBasic認証から移行) |

新たに秘密情報を追加する場合も、同様の構成ファイルに追加する。

**例外**: `YOUTUBE_API_KEY`・`CRON_SECRET`・`RAKUTEN_APPLICATION_ID`・`RAKUTEN_ACCESS_KEY`
（`lib/constants.ts`）はこのリポジトリがpublicであるためソースへの直書きは採らない。
ローカル開発は`.env.local`（gitignore対象）から供給し、Cloud Runデプロイ時は
`deploy.sh`/`deploy.ps1`が`.env.local`から読み取って`gcloud run deploy --update-env-vars`で
Cloud Runの環境変数として注入する。`CRON_SECRET`はCloud Schedulerが
`app/api/admin/refresh-new-videos`を呼ぶ際の`X-Cron-Secret`ヘッダー認証用（フェーズ4.5ステップ4）。
`RAKUTEN_APPLICATION_ID`・`RAKUTEN_ACCESS_KEY`は楽天ウェブサービス（楽天ブックスAPI）の認証情報で、
ゲームタイトル登録時のパッケージ画像検索に利用する（フェーズ4.5ステップ8）。

**`RAKUTEN_AFFILIATE_ID`（楽天アフィリエイトの提携先ID）は上記とは供給経路が異なる**。秘密情報では
なくリンクに露出する値だが、ブラウザ側（`lib/rakuten-affiliate.ts`）で`rakutenUrl`（Firestoreに
保存された非アフィリエイトの生URL）をアフィリエイトリンクに変換する際に使うため、
`NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID`としてNext.jsのビルド時に埋め込む必要がある。そのため
Cloud Runの実行時環境変数（`--update-env-vars`）ではなく、`deploy.sh`/`deploy.ps1`が
`.env.local`の`RAKUTEN_AFFILIATE_ID`を読み取り、`gcloud builds submit`のDockerビルド引数
（`cloudbuild.yaml`の`_RAKUTEN_AFFILIATE_ID`→`Dockerfile`の`ARG`/`ENV`）として渡す。

商品検索時点でアフィリエイトタグを確定させて`rakutenUrl`に保存する方式（`affiliateId`を
API検索リクエストに付与する方式）も検討したが、その場合`RAKUTEN_AFFILIATE_ID`を後で変更しても
過去に登録済みのゲームのURLには反映されず、Firestoreの全件書き換えが必要になってしまう。
表示時点で変換する現方式なら、値を変えて再デプロイするだけで新旧問わず全ゲームのリンクに
即座に反映される（ただし実行時環境変数ではなくビルド時埋め込みのため、値の変更には
再デプロイ＝再ビルドが必要）。未設定でもエラーにはならず、通常の（非アフィリエイト）URLに
フォールバックするだけなので、`deploy.sh`/`deploy.ps1`では必須チェックの対象にしていない。

## 本番環境での管理

本番環境ではすべての秘密情報を **GCP Secret Manager** で管理する。Cloud Functions からは Secret Manager 経由でアクセスする。詳細は `document/specification/common/技術スタック仕様書` を参照。
