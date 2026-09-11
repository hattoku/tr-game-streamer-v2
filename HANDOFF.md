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

1. ~~**Firestoreセキュリティルールの本設計**（最優先・ブロッカー）~~ → **2026-09-09対応済み**
   `firestore.rules` / `firestore.indexes.json` を新規作成し、`firebase.json`に組み込んだ上で
   本番プロジェクト（`tr-game-streamer`）にデプロイ済み。29コレクション全てに
   `Firestoreデータモデル設計書.md`セクション6と`共通 機能別権限表 仕様書.md`に基づくルールを定義。
   ロール判定はFirebase Auth Custom Claims（`role`）を正とする方針。
   **積み残し・要確認事項**:
   - レビュー一覧等で投稿者の`displayName`/`profileImageUrl`を表示する際、`users`ドキュメントを
     本人・管理者以外は読めない設計にしたため、`reviews`側への非正規化コピーなど別の参照方法を
     機能実装時に検討する必要あり。
   - `collection_candidates`/`new_title_candidates`の承認操作を「オーナー限定」にすべきか
     「管理者（オーナー・運営者）共通」にすべきかは仕様書に明記がなく、暫定的に管理者共通で許可。
   - ステージング環境（`tr-game-streamer-stg`）へは未デプロイ（下記5.参照）。
   - ルール詳細は`firestore.rules`冒頭コメント参照。
2. ~~**技術スタックのバージョン方針決定**~~ → **2026-09-09対応済み**
   - コミット`98851e0`で最新版に更新済み（Next.js 16.3.4 / React 19.2.8 / TypeScript 7 / Firebase 12）。
     `package.json`で確認可能。
3. **BigQueryエクスポート拡張機能の扱い** — 残すか削除するか。
4. **X（Twitter）認証・パスキー認証の追加方針** — 対応可否・コストの調査を含む。
5. **ステージング環境（`tr-game-streamer-stg`）のリセット** — 本番と同様の作業がまだ未実施
   （Firestoreルール・データ、Auth設定等、本番との差異を要確認）。
6. **v1の旧YouTube Data APIキーの無効化**（任意のクリーンアップ、緊急性低）
   GCP「APIとサービス→認証情報」画面から。Cloud Runサービス自体は削除済みのため実害は縮小済み。

## 開発全体のロードマップ（合意済み、これから着手する順序の目安）

### フェーズ1: 開発の土台づくり（次にやること）
1. ~~Firestoreセキュリティルールの本設計~~ → 対応済み（上記1.参照）
2. ~~技術バージョン方針の確定~~ → 対応済み（上記2.参照）
3. ~~マスタデータ投入基盤の整備~~ → **2026-09-10対応済み**
   - `firebase-admin`導入。認証はサービスアカウント鍵ファイルを使わずApplication Default
     Credentials（`gcloud auth application-default login`）方式を採用（理由は
     `wiki/concepts/マスタデータ投入方針.md`参照）。
   - `scripts/`配下に投入スクリプト一式を実装（`seed-master-data.mjs`、`lib/firebase-admin.mjs`、
     `lib/tag-id.mjs`、`data/`）。`tags`コレクション用の`TAG-{連番}`採番は`counters/tags`
     ドキュメントをトランザクションで更新する方式。`npm run seed:master:stg` /
     `npm run seed:master:prod`で実行（冪等・既存ドキュメントは名前照合でスキップ）。
     **将来、管理画面/ユーザーからのタグ追加機能を実装する際は、この`counters/tags`
     トランザクション手順を再利用すること**（採番衝突防止）。
   - 実装時に`themes`コレクションに`genreId`がないこと、`tags`がゲームタイトル・再生リスト
     共通の単一マスタであることを確認し、テーマ・タグの重複排除が必要と判明
     （詳細は`wiki/concepts/マスタデータ投入方針.md`）。
4. ~~マスタデータ投入実行~~ → **2026-09-10対応済み**
   - ジャンル9件・テーマ40件・タグ88件（重複排除後の確定件数）の合計137件を、ステージング
     （`tr-game-streamer-stg`）・本番（`tr-game-streamer`）の両方に投入済み。両環境とも
     再実行して冪等性（重複作成されないこと）を確認済み。実ゲームタイトル（`games`コレクション）
     は楽天ブックスAPI取得＋将来のAI運営者新作検知バッチで賄う設計のため、フェーズ1の手動投入
     対象には含まれない（`document/specification/db/Firestore データモデル設計書.md`3.5節参照）。
   - `ゲームタイトルタグ初期登録データ一覧.md`の集計表と実際の列挙件数に2件の差異が残っている
     （`wiki/concepts/マスタデータ投入方針.md`参照）。投入スクリプトは冪等なので、原因判明後に
     ソース文書を修正して再実行すれば差分のみ反映される。
5. ~~認証まわりの実装土台~~ → **2026-09-10対応済み（最小スコープ）**
   - `contexts/AuthContext.tsx`（user/role追跡）、`app/api/auth/init-user/route.ts`
     （Next.js API Route + Admin SDKでCustom Claims初期role付与。理由は
     `wiki/sources/2026-09-10-auth-foundation.md`参照）、`app/login/page.tsx`
     （メール/パスワードのログイン・新規登録・ログアウトのみの動作確認用ページ）を実装。
   - **スコープ外**（ユーザーと合意の上、次フェーズ以降に先送り）: ソーシャルログイン
     （Google/X）、パスキー、パスワード再発行、初期設定ウィザード（プロフィール設定・
     ジャンル/タイトル選択・マイリスト追加）。`games`・マイリスト機能が未実装のため
     現時点では動かせない。フル仕様は
     `document/specification/page/ページ ログイン アカウント登録・ログイン仕様書.md`参照。
   - `firestore.rules`冒頭コメントの「Custom ClaimsはCloud Functions経由でのみ設定」という
     記述は実態と異なる（Cloud Functions基盤が存在しないためNext.js API Routeを採用した）。
     次回`firestore.rules`を触る際にコメントを修正すること。
   - 本番環境に対しEnd-to-Endで動作確認済み（テストユーザーは削除済み）。**副次的発見**:
     ステージングのAuthenticationが未設定（`CONFIGURATION_NOT_FOUND`）であることを実際に
     確認した。未解決事項5.のステージングリセットが必要。

これでフェーズ1の項目は全て対応済み。次はフェーズ2（MVP機能実装）。

### フェーズ2: MVP機能実装（企画書の初期フェーズ核機能）

**2026-09-10、計画を精緻化**（詳細は`wiki/sources/2026-09-10-phase2-plan.md`参照）。
「YouTube埋め込みプレーヤー」「マイリスト機能」「新着通知」は並列ではなく、実質
一直線の依存チェーンになっていることが判明したため、以下の順序で実装する。

1. ~~**テスト用`games`データの投入**~~ → **2026-09-11対応済み**
   `scripts/data/test-games.mjs`・`scripts/seed-test-games.mjs`を実装（既存のマスタ投入
   スクリプトと同じ冪等パターン。`title`で既存照合）。実在タイトル5件（ゼルダの伝説
   ティアーズ オブ ザ キングダム／ポケットモンスター スカーレット・バイオレット／
   スプラトゥーン3／エルデンリング／モンスターハンターライズ）をステージング・本番の
   両方に投入済み（`npm run seed:games:stg` / `seed:games:prod`）。楽天ブックスAPI連携が
   未実装のため`rakutenItemCode`等はnull、genreId/themeIds/gameTagIdsは既存マスタを
   名前で引き当てて解決している。
2. ~~**YouTube Data API連携基盤**~~（`lib/youtube.ts`等、依存なし）→ **2026-09-11対応済み**
   `lib/youtube.ts`（playlists/playlistItems/channels/videosのsnippet取得、REST fetchベース。
   googleapisパッケージは追加せず）、`lib/constants.ts`（`YOUTUBE_API_KEY`を環境変数
   `YOUTUBE_API_KEY`から供給）を実装。`npx tsc --noEmit`で型チェック済み。
   v1時代のAPIキー2件（GCPコンソールに残存していたv1の旧キー、Cloud Run削除済みで
   未使用）は削除し、新規キーを発行（API制限: YouTube Data API v3のみ）。`.env.local`の
   `YOUTUBE_API_KEY`に設定済み。実データ（Google Developersチャンネルの公開再生リスト）で
   channels/playlists/playlistItems/videosの4エンドポイント疎通確認済み、レスポンス形状が
   `lib/youtube.ts`の型定義と一致することを確認済み。
   **積み残し**: SECRET_MANAGEMENT.mdの「ソースに直書き」方針（Firebase同様の既定値埋め込み）
   はまだ反映していない。現状は`.env.local`（gitignore対象）頼みのため、他の開発者と鍵を
   共有する運用に切り替える際は方針通りlib/constants.tsへ直書きし表を更新すること。
3. ~~**再生リスト登録フロー（管理者専用の最小版）**~~（依存: 1, 2）→ **2026-09-11対応済み**
   `ページ 再生リストを追加する 仕様書.md`準拠。新規チャンネル発見時のAI
   （Gemini）による説明文自動生成は**スコープ外・手入力のみ**（ユーザー確認済み。
   Gemini API連携・Secret Manager鍵管理は別途）。一般ユーザーの「提案」フロー・
   ゲームタイトル追加提案モーダル（4.2.2節）も同様にスコープ外（管理者専用の最小版）。
   実装:
   - `lib/api-auth.ts`（Bearer IDトークン検証＋owner/operatorロール確認の共通ヘルパー）
   - `app/api/playlists/preview/route.ts`（書き込みなし。URL blur時にYouTube APIで
     再生リスト・チャンネル情報を取得し、公開状態・既存登録状況を返す）
   - `app/api/playlists/register/route.ts`（本登録。プレビュー結果を信用せずサーバー側で
     再取得し、`playlists`/`channels`/`videos`への書き込みと`games.playlistCount`の
     加算をFirestoreバッチで実行）
   - `app/playlists/new/page.tsx`（`login/page.tsx`と同様、スタイリングなしの動作確認用
     ページ。ゲームタイトル選択は`games`コレクション全件をクライアントで取得し
     タイトル部分一致でフィルタする簡易実装 — 全件検索用インフラは未整備のため）
   - 「チャンネル一致」チェック（仕様書4.1.5節）は、再生リストのchannelIdでチャンネル
     情報を取得している都合上、この実装では構造的に常にtrueになる。チャンネル詳細
     ページ流入時の「流入元チャンネルとの一致」判定（5.2節）は、該当する流入導線
     （チャンネル詳細ページ）自体が未実装のため今回は組み込んでいない。
   
   **E2E動作確認**（本番環境、一時テスト管理者アカウントを作成→確認後に削除）:
   実在の公開再生リスト（Google Developersチャンネル）で登録→`playlists`/`channels`/
   `videos`（16件）が仕様書3.2〜3.4節のスキーマ通りに書き込まれること、
   `games.playlistCount`が加算されること、同一再生リストの再登録が`already_registered`
   (409)で拒否されることを確認。確認後、作成したテストデータ・テストユーザーは
   全て削除済み（本番DBへの影響は残っていない）。
   
   **副次的に発見・修正したバグ**: `.env.local`の`NEXT_PUBLIC_FIREBASE_API_KEY`が
   無効な値（おそらくFirebase Webアプリ再登録前の旧キー）になっており、
   `lib/firebase.ts`の`||`フォールバックより優先されるため、**ローカル開発環境での
   Firebase Authenticationが機能しない状態だった**（`auth/api-key-not-valid`）。
   `lib/firebase.ts`にハードコードされている現行の正しいキーの値に修正済み。
4. **マイリスト機能**（依存: 3）
   `ページ マイリスト機能仕様書.md`準拠。**実装前にスキーマ拡張が必要**:
   現状の`mylist`ドキュメント（`userId, playlistId, createdAt, updatedAt`の4項目、
   DB設計書3.11節）には視聴ステータス・再生リスト単位の逆順トグル用フィールドが
   存在しない。仕様書の要求に合わせてフィールドを追加してから実装する。
5. **動画プレーヤー（連続再生・視聴進捗）**（依存: 3。4とは並行可）
   `ページ 再生リスト詳細ページにおける動画プレーヤー 仕様書.md`準拠。
   `watch_progress`/`watch_history`の読み書きが必要。**実装前にスキーマ拡張が
   必要**: `users`ドキュメントに連続再生ON/OFFのグローバル設定フィールドが
   存在しない（現行スキーマにはなし）。
6. **新着通知**（依存: 4）
   `ページ ユーザー通知機能仕様書.md`準拠。**Firestoreデータモデル設計書に
   `notifications`コレクションの定義が存在しない**（管理者向け`admin_notifications`
   とは別物）。実装前にスキーマを新規設計する必要がある。
   定期取得バッチ（新着動画検知）は**今回はCloud Functions/Cloud Schedulerを
   本格導入せず、管理画面からの手動再取得ボタン（Next.js API Route）で代替する**
   （ユーザー確認済み。本格的な定期実行化は後回し）。この手動トリガー経由でも
   新着通知の発火ロジック自体は本実装し、UXとして成立させる。

4系統のFirestoreスキーマギャップ（mylist・users・notifications、いずれも
DB設計書に未記載）は、実装前に`document/specification/db/Firestore データモデル
設計書.md`側にも追記して整合を取ること（`.agent/rules/development_flow.md`の
ドキュメント駆動開発方針に従う）。

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
