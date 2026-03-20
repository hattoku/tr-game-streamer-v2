# 秘密情報の管理方針

## 現在の方針（開発フェーズ）

開発・共有の利便性のために、以下の秘密情報をソースコードに直接記述しリポジトリに含めている。

| ファイル | 内容 |
|---------|------|
| `lib/constants.ts` | YouTube API キー |
| `lib/firebase.ts` | Firebase 認証情報 |

新たに秘密情報を追加する場合も、同様の構成ファイルに追加する。

## 本番環境での管理

本番環境ではすべての秘密情報を **GCP Secret Manager** で管理する。Cloud Functions からは Secret Manager 経由でアクセスする。詳細は `document/specification/common/技術スタック仕様書` を参照。
