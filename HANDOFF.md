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
7. **「タイムライン」ページの仕様化**（2026-09-12追加、フェーズ2.5のモバイルナビ再設計で発生）
   ボトムタブとPCナビに「タイムライン」を置いたが専用ページの仕様が無く、暫定で通知一覧
   `/notifications`を割り当てている（`components/layout/nav.ts`）。マイリスト登録中の再生リストの
   新着動画を時系列で見る導線として、ページ仕様書を起こしてから本実装する（ユーザー決定）。

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
4. ~~**マイリスト機能**~~（依存: 3）→ **2026-09-11対応済み**
   `ページ マイリスト機能仕様書.md`準拠。`mylist`スキーマに`watchStatus`
   （5値：見たい/視聴中/完走/一時中断/断念）・`isReverseOrder`（逆順トグル）を追加し、
   `Firestore データモデル設計書.md`をv1.8へ更新（3.11節）。新着通知トグル
   （5.4節）は既存の`users.showNewArrivalNotification`フィールドをそのまま使う設計の
   ため、スキーマギャップではなかった。
   実装は`app/mylist/page.tsx`（フィルタタブ・件数バッジ・ソート・ステータス変更・
   逆順トグル・空状態）。`mylist`コレクションはfirestore.rulesで本人のみRW可となって
   いるため、Admin SDK経由のAPI Routeを介さずクライアントSDKから直接読み書きする
   （games一覧取得と同じ方針）。
   **今回のスコープ外**（ステップ5・6が未実装のため）:
   - カード子エリア「最後に再生した動画」・進捗バー（`watch_progress`が必要）
   - 新着動画の🔔NEWバッジ（新着通知バッチが必要）
   - ソート「最後に再生した動画（新しい順）」は暫定的に`mylist.updatedAt`降順で代替
   - TOPページ連携（TOPページ自体が未実装）
   - 「マイリストに追加」ボタンは本来は再生リスト詳細ページ（ステップ5で実装）に
     設置される想定だが、そのページがまだ無いため`/mylist`ページ内に暫定の追加フォーム
     （既存`playlists`からの選択式）を設けている。ステップ5実装時に本来の導線へ移行し、
     この暫定フォームは削除する想定。
   
   **E2E動作確認**（本番環境、一時テスト管理者アカウントで確認後に削除）:
   クライアントSDK経由で追加→ステータス変更→逆順トグルON→削除の一連の操作と、
   他ユーザーのuserIdでの書き込み試行がfirestore.rulesにより`permission-denied`で
   拒否されることを確認。確認に使った再生リスト登録・テストユーザーも含め、
   本番DBへの影響は残っていない。
5. ~~**動画プレーヤー（連続再生・視聴進捗）**~~（依存: 3。4とは並行可）→ **2026-09-11対応済み**
   `ページ 再生リスト詳細ページにおける動画プレーヤー 仕様書.md`準拠。`users`に
   `isContinuousPlayEnabled`（連続再生設定）を追加し、`Firestore データモデル
   設計書.md`をv1.9へ更新。`firestore.rules`のusers.update許可フィールドにも追加。
   `videos`（playlistId+position）・`watch_progress`（userId+playlistId+updatedAt）用の
   複合インデックスを`firestore.indexes.json`に追加し、ステージング・本番両方へ
   ルール・インデックスをデプロイ済み。
   
   実装は`app/playlists/[playlistId]/page.tsx`（本番のURL `/playlists/[playlistId]`は
   ステップ3の完了画面「再生リストを見る」リンク先と一致）。YouTube IFrame Player API
   （`window.YT.Player`、postMessageベース）を使い、5秒ごとの`getCurrentTime()`取得で
   `watch_progress`/`watch_history`を更新、`onStateChange`のENDED検知で連続再生時に
   自動的に次の動画へ遷移する。逆順トグルは`mylist.isReverseOrder`をそのまま共有し、
   マイリスト未登録時はページ内のローカル状態のみ（仕様書通りの挙動）。
   **今回のスコープ外**（仕様書自身の非スコープに加えて）: レビュー投稿・配信者情報・
   ゲーム情報セクション（フェーズ3以降）、シアターモードの黒背景等の視覚デザイン
   （トグルの状態管理のみ実装）、未ログインユーザーの視聴進捗LocalStorage保存
   （ゲストは進捗が保存されない）、動画リストの現在再生中スクロール追従。
   
   **動作確認の範囲**: Firestoreデータ層（複合インデックスの疎通、
   `watch_progress`/`watch_history`/`mylist`/`users`への読み書きとルール許可）は
   本番環境で一時テスト管理者アカウントを使いクライアントSDK経由で確認済み
   （確認後にテストデータ・アカウントは削除済み）。**一方、YouTube IFrame Player APIを
   使った実際のブラウザ上の挙動（動画切り替え・連続再生の自動遷移・進捗バー表示等）は
   ブラウザ自動化ツールがこの環境に無いため未確認**。ユーザー側でブラウザから
   `/playlists/[playlistId]`にアクセスしての動作確認を推奨する。
6. ~~**新着通知**~~（依存: 4）→ **2026-09-11対応済み**
   `ページ ユーザー通知機能仕様書.md`準拠。同仕様書が定義する4種別（シリーズ新着・
   お知らせ・審査結果・お問い合わせ返信）のうち**「シリーズ新着通知」のみ実装**
   （他3種別は依拠する機能＝お知らせ管理・審査ワークフロー・お問い合わせ機能が
   未実装のためスコープ外）。FCMプッシュ通知・ヘッダーベルアイコン（共有ヘッダー
   自体が未実装）・通知設定ページ・90日保持の自動削除バッチも同様にスコープ外。
   `notifications`コレクションを新規設計し、`Firestore データモデル設計書.md`を
   v1.10へ更新（3.30節。`type`フィールドで将来の種別追加に対応できる設計）。
   `firestore.rules`に本人のisRead更新のみ許可するルールを追加、`userId+createdAt`・
   `userId+isRead+createdAt`の複合インデックスを追加し、ステージング・本番へ
   ルール・インデックスをデプロイ済み。
   
   定期取得バッチ（新着動画検知）は**Cloud Functions/Cloud Schedulerを本格導入せず、
   管理画面からの手動再取得ボタン相当のAPI Routeで代替**（ユーザー確認済み）。
   `共通 youtube定期取得仕様書.md`のRSS優先・APIフォールバックという二段構えも、
   手動・低頻度トリガーのためクォータ最適化の優先度が低いと判断し、今回は
   YouTube Data APIを都度直接呼び出す方式に単純化した。実装:
   - `app/api/admin/refresh-new-videos/route.ts`（管理者専用。全公開再生リストを対象に
     YouTube APIで最新の動画一覧を取得し、Firestore未登録の動画を差分検出。新着があれば
     `videos`・`playlists`を更新し、`mylist`登録者全員に`notifications`を生成）
   - `app/notifications/page.tsx`（通知一覧・フィルタ・個別既読・一括既読・空状態。
     管理者向けの手動再取得ボタンは、専用の管理画面がまだ存在しないため暫定的に
     このページ内に設置している）
   
   **E2E動作確認**（本番環境、一時テスト管理者アカウントで確認後に削除）:
   実在の再生リストを登録→マイリスト登録→動画1本をFirestoreから意図的に削除して
   「未取得の新着」を再現→手動再取得APIを実行し、新着1本検出・`videos`復元・
   `notifications`1件生成（本文・宛先とも仕様通り）を確認。`/notifications`ページと
   同じクエリ（全件・未読絞り込み）が複合インデックス経由で正しく動くこと、本人による
   既読更新は成功し他ユーザーのuserIdへの書き込みは`permission-denied`で拒否される
   ことも確認。確認に使ったデータ・アカウントは全て削除済み、本番DBへの影響は残って
   いない。
   
   これでフェーズ2の6ステップすべてが完了。次はフェーズ2.5（デザイン適用）。

4系統のFirestoreスキーマギャップ（mylist・users・notifications、いずれも
DB設計書に未記載）は、実装前に`document/specification/db/Firestore データモデル
設計書.md`側にも追記して整合を取ること（`.agent/rules/development_flow.md`の
ドキュメント駆動開発方針に従う）。

### フェーズ2.5: デザイン適用（2026-09-11、ロードマップに追加）

フェーズ2（MVP機能実装）の6ステップが完了した時点で実施する。これまでのページ
（`/login`・`/playlists/new`等）は`login/page.tsx`の前例を踏襲し、意図的にノー
スタイルで実装してきた（機能の正しさを優先）。デザイン用の仕様書
（`document/specification/common/共通 デザイントークン仕様書.md`・
`共通 uiコンポーネント フロント 仕様書.md`）はすでに存在するため、フェーズ2完了時に
これらを適用し、「登録→視聴→マイリスト管理→新着通知」というコアループ一式へ
まとめてデザインを当てる。

**採用理由**（3案から選定）:
- 各ステップと同時進行でデザインを当てる案 → コンポーネントの使い方がステップごとに
  ブレやすく、フェーズ2の残りステップ（4〜6）はいずれもFirestoreスキーマ設計から
  入るため機能面だけでもセッションが重く、デザインまで同時に負うと重すぎる
- フェーズ3完了後まで待つ案 → 手戻りは最小だが、コア体験が一通り触れる状態に
  なってからさらに長く無骨な画面が続き、個人開発のモチベーション維持の観点で不利
- → 折衷案として、コアループが揃うフェーズ2完了時点を採用

**2026-09-11、計画を策定**（詳細は`wiki/sources/2026-09-11-phase2.5-design-plan.md`参照）。
スタイリングは技術スタック仕様書の指定どおりTailwind CSS v4を導入し、デザイントークンは
`app/globals.css`の`@theme`にCSS変数として仕様書のトークン名そのままで定義する。
モーダル・ドロワー・ドロップダウン・タブ・トーストの挙動はRadix UI Primitives（ヘッドレスUI）に
任せ、HeroUI/Mantine等の完成品ライブラリはフロントには入れない（2026-09-11ユーザー決定。
管理画面はフェーズ3以降に別途検討）。
仕様書側の「実装時に決定」項目（入力要素・フォーカス・トースト色・ヘッダー高さ等）と
仕様書間の食い違い（進捗バー色）は、コードより先に仕様書を更新して埋める。

1. ~~**仕様書の穴埋め**~~（デザイントークン仕様書v1.2追記、進捗バー色の統一、トースト位置確定）
   → **2026-09-11対応済み**（`wiki/sources/2026-09-11-design-foundation.md`）
2. ~~**スタイリング基盤とUI部品**~~（Tailwind導入、`components/ui/`: Button/Card/Chip/Badge/
   Tag/ProgressBar/Skeleton/Spinner/EmptyState/Input/Modal/Toast/icons）
   → **2026-09-11対応済み**。Tailwind 4.3.3・Radix UI（dialog/dropdown-menu/tabs/toast）を
   固定版で導入、`app/globals.css`の`@theme`にトークン定義、`components/ui/`に17ファイル。
   tsc/build成功。部品はまだページ未使用のため見た目の確認はステップ3以降で行う。
3. ~~**共通レイアウトとシステムページ**~~（`components/layout/`: Header・ドロワー・
   ユーザードロップダウン・Footer・PageContainer・AuthLayout、`not-found.tsx`/`error.tsx`/
   `loading.tsx`、TOPを登録済み再生リスト一覧の最小版に置き換え）
   → **2026-09-11対応済み**（`wiki/sources/2026-09-11-layout-and-system-pages.md`）。
   `app/(main)`/`app/(auth)`のルートグループを導入（URL不変）。未実装ページへのナビリンクは
   仕様どおり置き404で受ける。「アカウント作成」は`/signup`未実装のため暫定で
   `/login?mode=signup`（`components/layout/nav.ts`の`SIGNUP_HREF`）。ブラウザでの見た目は
   本環境で確認できないため、ユーザー側で3幅（767/768/1400px超）の目視確認を推奨。
   **2026-09-12**: スマホ実機確認の指摘を受けモバイルナビを2度再設計。最終形は**ボトムタブバー**
   （ホーム／タイムライン=暫定で通知一覧／さがす／マイページ=未ログイン時はアカウント作成へ）＋
   「さがす」一覧ページ限定のヘッダー直下タブ列（UI仕様書 v1.8・トークン仕様書 v1.4）。
   タブ先が404にならないよう`/playlists`（一覧最小版）・`/games`/`/channels`/`/collections`（準備中）を
   暫定追加（本実装はフェーズ3）。常時表示ナビバーは廃止。その後、PCナビに「タイムライン」を追加し、
   モバイルにはサポート・規約リンク・©だけを収めたハンバーガーメニューを再導入（フッターはモバイル
   非表示、UI仕様書 v1.10）。
   **テストモードウィジェット**（UI仕様書 §7）も実装済み。`.env.local` の `NEXT_PUBLIC_TEST_MODE=true` で
   右下にログイン切替ウィジェットが出る（`/api/test/sign-in` がテスト用会員 `test-user@puremite.test` を
   自動作成し、使い捨てパスワードでログイン）。本番ビルドでは `cloudbuild.yaml` の `_TEST_MODE` を渡さない限り無効。
4. **再生リスト詳細**（2カラム・ヒーロー・基本情報/動画リスト/配信者カード・シアターモード・
   再生中動画への自動スクロール・「マイリストに追加」ボタンの本来位置への移設＋ログイン要求モーダル）
5. **マイリスト**（フィルタタブ件数・ステータス変更ドロップダウン・子エリア「最後に再生した
   動画」・🔔NEW行・空状態、暫定追加フォームの削除）
6. **通知一覧とヘッダーベル**（未読件数バッジ、カード・タブ・空状態、管理者用再取得の隔離）
7. **ログインと再生リスト登録**（AuthLayout、§12.1準拠フォーム、登録フォーム/プレビュー/
   ゲーム選択モーダル/完了画面）
8. **仕上げ**（3幅での目視確認はユーザー側、キーボード操作・aria、lint/build、Wiki更新）

フェーズ2.5で見送るもの: インフォメーションバー、テストモードウィジェット、通知ドロップダウン、
未実装ページ本体（`/playlists`・`/games`等はナビリンクだけ置き404で受ける）、TOP本実装、
ゲーム情報・レビュー投稿セクション。

### フェーズ3: 全フェーズ共通機能
- レビュー・スコアリング（5段階＋コメント）
- タグシステム（ニコニコ方式）
- （フェーズ2.5で当てたデザインをこれらの追加画面にも展開する差分作業を含む）

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
