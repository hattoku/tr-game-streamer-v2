# 引継ぎドキュメント（2026-09-07時点）

このドキュメントは、別セッション（Wikiリポジトリ `ak_tr_game_streamer_dev` 上のClaudeセッション）
で行った「プレミテv2立ち上げ準備」の作業内容を、このリポジトリで作業を継続するセッションに
引き継ぐためのものです。詳細な作業ログ・調査経緯は、Wikiリポジトリの
`raw/sessions/2026-09-07_v2-firebase-gcp-reset.md` および `wiki/concepts/firebase-gcp-infrastructure.md`
に記録されています（このリポジトリからは直接参照できない可能性があるため、必要な情報は本書に
転記しています）。

## 前提: このプロジェクトの背景

- 前身プロジェクト `tr-game-streamer`（v1、コードネーム「ゲムコメ」、GitHub: `hattoku/tr-game-streamer`）は、
  **データ消失によりデザインとDBの整合性が取れなくなり開発中断**した。
- v2は同じ技術スタックを踏襲しつつ、`document/`配下の仕様書（47本）に基づいてフルリニューアルする
  ドキュメント駆動開発方針（`.agent/rules/development_flow.md`参照）。
- Firebase/GCPプロジェクトは**v1と同じ`tr-game-streamer`を継続利用**する方針が確定済み
  （理由: GCPのプロジェクトIDは削除後も永久に再利用不可のため、削除→同名再作成は不可能。
  表示名もIDとの対応を分かりやすくするため`tr-game-streamer`のまま維持）。

## 完了した作業（Firebase/GCPプロジェクトのリセット）

### 緊急対応（セキュリティ）
- Firestoreセキュリティルールが `allow read, write: if true;` のまま**全公開状態**だったのを発見し、
  `allow read, write: if false;` に変更して全閉鎖した。**→ 本番用の正式なルールはまだ未設計。**
- v1のFirebase Webアプリ用APIキーが、このリポジトリ（public）の`lib/firebase.ts`にデフォルト値として
  ハードコードされコミット済みだった。Firebaseコンソールで新規Webアプリ登録を作り直し、新しいAPIキー
  一式に差し替え済み（`lib/firebase.ts`の本番ブロック、コミット`20e51ea`でmain反映済み）。旧アプリ
  登録は削除済み（Firebase仕様で30日後に完全削除）。

### Firestore / Authentication
- v1時代のFirestoreデータ（`playlists`/`videos`/`reviews`コレクション、非正規化・v2の29コレクション
  設計とは非互換）は全削除済み。
- Firebase Authenticationで「メール/パスワード」「Google」を有効化済み。GoogleログインのOAuth同意
  画面表示名は「プレミテ」に設定済み。
- **X（Twitter）認証・パスキー認証は未着手**（意図的に保留。Xは近年のAPI有料化の影響、パスキーは
  Firebase Authenticationの標準プロバイダ一覧に見当たらず要調査）。

### GCPリソースの棚卸し
- Cloud Runサービス`tr-game-streamer`（v1の実際の稼働デプロイ、公開Ingress、YouTube Data APIキーを
  環境変数に保持していた）を削除済み。
- Artifact Registryの`cloud-run-source-deploy`リポジトリ（上記サービスの旧イメージ）を削除済み。
- `puremite`という名前のCloud Runサービス（`deploy.sh`が対象とする本来のデプロイ先）とArtifact
  Registryの`tr-game-streamer`リポジトリ内`puremite`パッケージはそのまま維持。
- **Firebase Extension「Export Collections to BigQuery」が既に導入済み**であることが判明
  （`ext-firestore-bigquery-export-*`という名前で存在、`reviews`コレクションを監視）。
  技術スタック仕様書には「将来対応・未導入」と書かれているが実態と食い違っている。
  **残すか削除するかは未決定**。

## 未解決事項（このリポジトリでの作業として引き継ぐもの）

優先度が高い順:

1. **Firestoreセキュリティルールの本設計**（最優先・ブロッカー）
   現在`if false`で全閉鎖中。`document/specification/db/Firestoreデータモデル設計書.md`
   （29コレクション定義）と`document/specification/common/`配下の権限表を基に、実際に動く
   ルールを設計する必要がある。
2. **技術スタックのバージョン方針決定**
   - v1到達点: Next.js 16.1.1 / React 19.2.3
   - v2の`package.json`現状: Next.js 14.1.0 / React 18（まだ雛形段階）
   - どちらに揃えるか未決定。
3. **BigQueryエクスポート拡張機能の扱い** — 残すか削除するか。
4. **X（Twitter）認証・パスキー認証の追加方針** — 対応可否・コストの調査を含む。
5. **ステージング環境（`tr-game-streamer-stg`）のリセット** — 本番と同様の作業がまだ未実施
   （Firestoreルール・データ、Auth設定等、本番との差異を要確認）。
6. **v1の旧YouTube Data APIキーの無効化**（任意のクリーンアップ、緊急性低）
   GCP「APIとサービス→認証情報」画面から。Cloud Runサービス自体は削除済みのため実害は縮小済み。

## 開発全体のロードマップ（合意済み、これから着手する順序の目安）

### フェーズ1: 開発の土台づくり（次にやること）
1. Firestoreセキュリティルールの本設計
2. 技術バージョン方針の確定
3. マスタデータ投入（`document/master/`配下の初期データをFirestoreへ）
4. 認証まわりの実装土台（Auth Context、ログイン/サインアップ画面）

### フェーズ2: MVP機能実装（企画書の初期フェーズ核機能）
- YouTube埋め込みプレーヤー（話数自動遷移）
- マイリスト機能
- 新着通知
- 対応する`document/specification/page/`配下の仕様書を都度読みながら実装

### フェーズ3: 全フェーズ共通機能
- レビュー・スコアリング（5段階＋コメント）
- タグシステム（ニコニコ方式）

### フェーズ4: 検証・本番デプロイ
- ステージング環境でE2E確認 → 本番（`puremite.net`）へのデプロイ確認

### フェーズ5以降（将来構想）
- AI運営者・信頼度スコアリング本格運用 → 格付けサイトへの転換、BigQuery/Terraform導入、
  iOS/Androidネイティブアプリ展開

## 参考: 主要ドキュメントの場所

- 全体像: `document/specification/仕様書トレーサビリティ・マトリクス.md`
- ページ一覧: `document/specification/page/ページ一覧仕様書.md`
- Firestoreデータモデル: `document/specification/db/Firestoreデータモデル設計書.md`
- 技術スタック: `document/specification/common/技術スタック仕様書.md`
- 開発フロー規約: `.agent/rules/development_flow.md`
- 秘密情報管理方針: `SECRET_MANAGEMENT.md`
