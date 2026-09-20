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
   - ~~レビュー一覧等で投稿者の`displayName`/`profileImageUrl`を表示する際、`users`ドキュメントを
     本人・管理者以外は読めない設計にしたため、`reviews`側への非正規化コピーなど別の参照方法を
     機能実装時に検討する必要あり。~~ → **2026-09-13対応済み**。`reviews`に
     `userDisplayName`/`userProfileImageUrl`を投稿・更新時点のスナップショットとして追加
     （フェーズ3ステップ1、Firestore データモデル設計書 v1.11）。
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
   （Firestoreルール・データ、Auth設定等、本番との差異を要確認）。→ **フェーズ4.5ステップ7**で棚卸しを実施予定（2026-09-20決定）。
6. **v1の旧YouTube Data APIキーの無効化**（任意のクリーンアップ、緊急性低）
   GCP「APIとサービス→認証情報」画面から。Cloud Runサービス自体は削除済みのため実害は縮小済み。
7. ~~**「タイムライン」ページの仕様化**~~ → **2026-09-12解消**。「タイムライン」は廃止し、ボトムタブは
   ホーム／マイリスト／さがす／マイページ、PCナビは4項目に戻した（ユーザー決定、UI仕様書 v1.16）。
   マイページタブの遷移先は暫定で `/history`（準備中ページ）。プロフィール／設定ページ実装後に見直す。
8. **パスワード再発行の導線**（ログイン仕様書 §5.1・§9・§12.4）— 2026-09-12 フェーズ2.5ステップ7で
   `/login` をデザイン適用した際、遷移先 `/password-reset` が未実装のため「パスワードをお忘れの方はこちら」
   リンクを**置いていない**（ユーザー決定、後日実装）。実装時は Firebase `sendPasswordResetEmail` ＋ §9.2 の
   「登録有無を明かさない」送信済み画面 ＋ §12.4 のフォームを `app/(auth)/password-reset` に追加し、
   `/login` の「ログインする」ボタン上にリンクを足す。→ **フェーズ7（友人デモ前）**で対応予定（2026-09-20決定）。
9. **「ログイン状態を維持する」チェックボックス**（ログイン仕様書 §5.1・§5.2: OFF=24時間 / ON=7日）—
   同じくステップ7で**置いていない**（ユーザー決定、後日実装）。Firebase クライアント SDK の永続化は
   local / session の2択で有効期限を指定できないため、仕様どおりにするにはサーバー側セッション Cookie
   （`createSessionCookie`、expiresIn 24h/7d）方式への切替が必要。現状は SDK 既定の local 永続化
   （ブラウザを閉じてもログイン維持）。
10. **ESLint の暫定構成（typescript-eslint が TypeScript 7 未対応）** — 2026-09-13 フェーズ2.5ステップ8で導入。
    Next.js 16 は `next lint` を廃止し、公式手順の `eslint-config-next` は typescript-eslint を使うが、typescript-eslint
    は TS 7.0 に未対応で読み込み時に例外を投げる（typescript-eslint/typescript-eslint#10940）。公式の回避策は
    `typescript` パッケージを TS 6 互換パッケージへ別名解決させる方法（`"typescript": "npm:@typescript/typescript6@^6"`
    ＋ `"@typescript/native": "npm:typescript@^7"`）だが、技術スタック決定（TS 7 固定）に関わるため採らず、
    `@babel/eslint-parser` で構文解析する暫定構成にした（`eslint.config.mjs` 冒頭コメント参照）。型情報を使う
    ルールは無い。typescript-eslint が TS 7.1 以降の API に対応したら `eslint-config-next` に戻す。
    **2026-09-13 ユーザー決定**: 3案（①暫定構成を維持し対応後に公式構成へ戻す／②公式回避策の別名解決で
    `eslint-config-next` に戻す／③oxlint へ切替）のうち①を採用。戻す条件は「TypeScript 7.1 正式版で JavaScript API が
    復活し、typescript-eslint の peer 範囲が TS 7 を含む」こと。そのとき `eslint-config-next` を入れ直し、
    `@babel/core`・`@babel/eslint-parser`・`@next/eslint-plugin-next`・`eslint-plugin-react-hooks` の直接依存を外す。
11. **`playlists.mylistCount` の集計が実質機能していない** — 2026-09-13 フェーズ3ステップ1実装時に判明。
    `AddToMylistButton`（マイリスト登録・解除・ステータス変更）はクライアントSDKから`mylist`を直接読み書きするが、
    `playlists.mylistCount`を増減させる処理がどこにも無い（`firestore.rules`の`playlists`更新許可フィールドにも
    含まれていない）。レビュー機能側は`app/api/reviews/upsert`が新規レビュー投稿時に`mylist`ドキュメントを
    自動作成することがあるが、`mylistCount`自体は更新していない。カード・詳細ページの「マイリスト」表示は
    常に登録時の初期値（0）のまま。対応時は`mylist`の作成・削除を伴う操作をAdmin SDK API経由に寄せるか、
    再生リストごとに`mylist`件数を都度集計するか（レビュー機能の`playlists.score`再計算と同じ方式）を検討する。
    → **フェーズ4.5ステップ3**でAdmin SDK API方式に寄せて対応予定（2026-09-20決定）。
12. ~~**常用アカウント（メールアドレスは伏字）の`users`ドキュメントが不完全**~~ →
    **2026-09-20補修済み**。2026-09-20フェーズ4.5ステップ1のE2E作業中に発生（詳細は同ステップの
    記述参照）。`role`フィールドのみ存在し、`uid`/`isAI`/`isBanned`/`isTestUser`/`fcmTokens`/
    `reviewCount`/`helpfulReceivedCount`/`accountCreatedAt`/`email`/`displayName`が無い状態
    だった。Admin SDKの一回限りスクリプト（一時ファイル、実行後削除済み）で`init-user`ルートと
    同じ既定値に補修。**補修時の事故**: 既に投稿済みだったレビュー1件分で`reviewCount`が1に
    加算済みだったところへ、既定値0の`merge:true`書き込みが上書きしてしまい、直後に気づいて
    1へ再修正済み（`helpfulReceivedCount`等の他の集計値は補修時点で加算対象の操作が発生して
    いなかったため影響なし）。**教訓**: 既存ドキュメントへの`merge:true`一括補修は、対象
    フィールドが他の処理で既に更新されている可能性を先に`.get()`で確認してから、補修対象外の
    フィールドを明示的に除外すること。

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
   右下にログイン切替ウィジェットが出る（`/api/test/sign-in` がテスト用会員 一般ユーザー
   `test-user@puremite.test`（role user）／管理者 `test-admin@puremite.test`（role owner）を
   自動作成し、使い捨てパスワードでログイン）。本番ビルドでは `cloudbuild.yaml` の `_TEST_MODE` を渡さない限り無効。
4. ~~**再生リスト詳細**~~（2カラム・ヒーロー・基本情報/動画リスト/配信者カード・シアターモード・
   再生中動画への自動スクロール・「マイリストに追加」ボタンの本来位置への移設＋ログイン要求モーダル）
   → **2026-09-12対応済み**（`wiki/sources/2026-09-12-playlist-detail-design.md`）。`components/playlists/`に
   部品化。シアターモード切替でYouTube iframeを破棄しないようDOM順固定・クラス切替のみ。**本番Firestoreに
   公開再生リストが0件のため、ブラウザでの再生確認には管理者で`/playlists/new`から1件登録が必要**。
4.5. ~~**デザイン方針の見直し**~~ → **2026-09-12対応済み**（`wiki/sources/2026-09-12-design-direction-crimson.md`）。
   ステップ4まで終えた時点でユーザーから「カードがフラット」「ボタンが文字リンクに見える」「枠や線の
   ガイドラインが無いのでは。エンタメサイトとしてもう少しリッチに」との指摘。`/mylist`・`/playlists/new` の
   指摘は未適用ページ（ステップ5・7で解消）だが、適用済みの `/playlists` も平坦で、原因はトークン仕様書 v1 の
   コンセプト（「UIクロームは背景に溶け込む」＋0.5px枠）そのものと判断。残りステップが全て Card/Button/Tabs
   の上に載るため、先に共通層を固めた。
   - 方向性モックアップ4案（黒ベース＋赤を共通に、2色目の違い）をキャンバスで比較し **A. クリムゾン（2色目を
     足さず、奥行きで演出）** を採用（ユーザー決定）。キャンバス: https://claude.ai/code/artifact/f0cf5e60-219c-4a93-9089-c5bfbe42c2bd 、
     作業ファイル `document/design/phase2.5-direction-mockups/`。
   - **共通 デザイントークン仕様書 v2.0**: §1 コンセプト改訂、境界線を 1px 半透明白に統一、赤の用途拡大
     （プライマリボタン・進捗・未読・再生中）、カードの面・影・ホバー浮き上がり、サムネイルの話数「N話」
     （「全N話」を廃止）とホバー再生ボタン、ゴーストボタン、タグのピル化、セレクトのドロップダウン化、
     §16「奥行き・演出」新設。動画プレーヤー仕様書 v1.5・再生リストを探す仕様書 v1.6 も「N話」に更新。
   - コード: `globals.css`（v2.0 トークン、`@utility` のグラデーション面）、`components/ui/` 全般
     （`SelectMenu`・`DropdownMenuRadioItem`・`CardChildArea`・`SectionHeading`・`PlayingBadge`・`CountLabel`
     追加、`Select` 削除）、レイアウト部品、`PlaylistGrid`・`VideoList`・再生リスト詳細に反映。tsc/build 成功、
     実ブラウザ（1440/390）で一覧・詳細を確認済み。
   - **ステップ5〜7で使う部品の注意**: セレクトは `SelectMenu`、削除等の従アクションは `Button variant="ghost"`、
     トグル（逆順・連続再生）は `Button active`、タブ右端のソートは `TabsList trailing`、子エリアは `CardChildArea`。
     詳細は `wiki/concepts/デザイントークン運用方針.md`。
5. ~~**マイリスト**~~（フィルタタブ件数・ステータス変更ドロップダウン・子エリア「最後に再生した
   動画」・🔔NEW行・空状態、暫定追加フォームの削除）→ **2026-09-12対応済み**
   （`wiki/sources/2026-09-12-mylist-design.md`）。`components/mylist/MylistCard.tsx` に部品化。
   ソート「最後に再生した動画（新しい順）」は `watch_progress` の最新 `updatedAt` で実装（フェーズ2の暫定
   `mylist.updatedAt` 代替を解消）。「最終話視聴済み」は最終話の `watch_history.progressPercent >= 95`、
   「新着あり」は未読の `series_new_episode` 通知の有無で判定。最終話の取得に `orderBy+limitToLast` を使うと
   降順の複合索引が必要になるため、`position == videoCount-1` の等価条件で引いている。未ログインは `/login` へ。
   新着通知ON/OFFトグル（§5.4）は設定ページが無いため据え置き（常にON）。
   **併せて修正**: 一般ユーザーで再生リスト詳細が権限エラーになる不具合（未登録時の `getDoc(mylist/{uid}_{playlistId})`
   がルール `isSelf(resource.data.userId)` を満たせない）。本人限定コレクションは ID 直打ちの `getDoc` ではなく
   `userId == 自分` を含むクエリで読む（`wiki/concepts/firestoreセキュリティルール方針.md`）。動作確認は一般ユーザーの
   テスト用会員でも行うこと。
6. ~~**通知一覧とヘッダーベル**~~（未読件数バッジ、カード・タブ・空状態、管理者用再取得の隔離）
   → **2026-09-12対応済み**（`wiki/sources/2026-09-12-notifications-design.md`）。
   `components/layout/NotificationBell.tsx`（未読件数を onSnapshot で監視、PC・モバイル共通）、
   通知一覧は見出し＋すべて既読／タブ（すべて・未読・シリーズ新着）／カード（未読ドット・種別・本文・相対時刻）／
   20件ページネーション／空状態／管理者用カードの隔離。
   **同時にナビを変更**: 「タイムライン」を廃止しボトムタブに「マイリスト」、マイページは暫定で `/history`
   （準備中ページを追加）。通知一覧への導線はヘッダーのベルのみ。
7. ~~**ログインと再生リスト登録**~~（AuthLayout、§12.1準拠フォーム、登録フォーム/プレビュー/
   ゲーム選択モーダル/完了画面）→ **2026-09-12対応済み**（計画 `wiki/sources/2026-09-12-login-and-register-design-plan.md`、
   記録 `wiki/sources/2026-09-12-login-and-register-design.md`）。
   `/login` は `?mode=signup` でアカウント作成モード（`Field`/`PasswordInput`/`Checkbox` の初使用）、ログイン仕様書 §5.3・§8.2 の
   バリデーション文言と Firebase エラーコードの日本語化を追加。`/playlists/new` は Card 1枚＋確認エリア（`CardChildArea`）＋
   ゲーム選択モーダル（`components/playlists/GameSelectModal.tsx`）＋完了画面（`PlaylistSummary.tsx` 共用）、
   エラーは §7 のインライン＋トースト。未ログインは `/login` へ、一般ユーザーは「管理者のみ」の空状態。
   **置かなかったもの**: パスワード再発行リンク・ログイン状態維持チェック（未解決事項 8・9 に記録、後日実装）。
   実ブラウザ（1440/390）で確認済み。完了画面と新規登録の成功だけは本番データが増えるため未撮影（コード上のみ）。
8. ~~**仕上げ**~~（3幅での目視確認、キーボード操作・aria、lint/build、Wiki更新）→ **2026-09-13対応済み**
   （`wiki/sources/2026-09-13-phase2.5-finish.md`）。
   - 767 / 768 / 1600px の3幅で全ページを `scripts/dev/screenshot.mjs` で撮影・確認。**768〜1023px でヘッダーが
     折り返す不具合**を発見し修正（ユーザーエリアの「マイリスト」「視聴履歴」リンクとユーザー名を lg 未満で非表示、
     ユーザードロップダウンに「マイリスト」「視聴履歴」を追加。UI仕様書 v1.17 §2.6・§2.9）。
   - キーボード・aria: モーダル／ドロワー／ドロップダウン／タブの `aria-expanded`・`aria-haspopup`・Esc で閉じる・
     フォーカス復帰・スクロール固定を実ブラウザで確認（Radix が担保）。`aria-modal="true"` は Radix が付けないため
     `Modal`・`MobileMenu` に明示。
   - **ESLint を導入**（`npm run lint`、`eslint.config.mjs`）。Next.js 16 で `next lint` が廃止されており、公式の
     `eslint-config-next` は typescript-eslint が TypeScript 7 未対応のため読み込めない。TypeScript に依存しない
     `@babel/eslint-parser` で構文解析し、`@next/eslint-plugin-next`（core-web-vitals）＋ `eslint-plugin-react-hooks` を
     直接組んだ（未解決事項 10）。react-hooks v7 の `set-state-in-effect` 指摘3件（マイリスト・通知・ベル）を修正。
   - `npm run lint` / `npx tsc --noEmit` / `npm run build` 成功。
   これでフェーズ2.5（デザイン適用）の全ステップが完了。次はフェーズ3。

フェーズ2.5で見送るもの: インフォメーションバー、テストモードウィジェット、通知ドロップダウン、
未実装ページ本体（`/playlists`・`/games`等はナビリンクだけ置き404で受ける）、TOP本実装、
ゲーム情報・レビュー投稿セクション。

### フェーズ3: 全フェーズ共通機能

ロードマップ上は「レビュー・スコアリング」「タグシステム」の2項目だが、2026-09-13の計画策定時に
調査した結果、この2機能の前提として`/games`（ゲームタイトルから探す・詳細）と`/playlists`
（再生リストを探す）の**本実装が未着手**であることが判明した（フェーズ2.5では意図的に最小版のまま
だった）。計画（`wiki/sources`未記録・セッション内会話のみ、詳細は各コミットメッセージ参照）では
**レビュー→ゲームタイトル詳細→タグシステム→探すページ本実装**の順で進めることをユーザーと合意。

**重要な発見**: `firestore.rules`・`firestore.indexes.json`はフェーズ1（2026-09-09）時点で
29コレクション全てに対してルール設計済みであり、`reviews`・`helpful_votes`・`tags`・`workflows`
等のルール・インデックスは既に本番・ステージングにデプロイ済みだった。フェーズ3のステップ2・3は
Admin SDKがルールをバイパスするAPIルートのみで完結し、ルール変更・デプロイが不要だった。

1. ~~**レビュー・スコアリング機能**~~（`ページ 再生リスト レビュー投稿機能 仕様書.md` /
   `共通 信頼度スコアリングシステム 仕様書.md`）→ **2026-09-13〜14対応済み**（コミット`bf11c1c`）。
   - `components/ui/StarRating.tsx`（★0.5刻み・ホバープレビュー・半星表示の共通部品）、
     `components/reviews/`（ReviewForm・ReviewList・ReportModal・ReviewSection）、
     `app/api/reviews/upsert`・`helpful`・`validate-comment`（信頼度スコアD/H/G/C/Wの算出は
     ジャンル専門性の集計に他ユーザー横断クエリが必要なためAdmin SDK側で実施）。
   - **通報機能はボタン・モーダルのみ実装**。`workflows`（type: `review_report`）へのレコード作成のみ
     行い、AI審査・オーナー承認等の処理は完全に先送り（管理画面フェーズで別途対応。フェーズ2の
     新着通知・審査系機能を実装しなかった前例と同じ扱い、ユーザー合意済み）。
   - NGワードは`ng_words`が管理者以外読めないルール方針のため、入力中のリアルタイム判定も
     `app/api/reviews/validate-comment`経由（デバウンス）で行う。初期データはスパム・勧誘系の
     安全な語句12件のみ投入（`scripts/seed-ng-words.mjs`、本番・ステージング投入済み）。
     差別語・侮蔑語等は運営者がFirebaseコンソールから直接追加する運用（ユーザー合意）。
   - `reviews`に投稿者表示用の非正規化コピー`userDisplayName`/`userProfileImageUrl`を追加
     （未解決事項1の解消）。`users`に`hideSpoilerReviews`を追加（ネタバレ非表示設定の永続化）。
     `users.reviewCount`/`helpfulReceivedCount`（既存の未使用集計フィールド）もレビュー投稿・
     削除・参考になった操作に連動させた。`firestore.rules`（`hideSpoilerReviews`追加）は
     本番・ステージング双方へデプロイ済み。
   - **信頼度スコアの実装後の不具合**: 視聴記録・参考になった・ジャンル被りが全て無いレビューは
     `W = (D+H+G)×C = 0`になり、加重平均計算上そのレビューが実質存在しないのと同じになる
     （ユーザーが★評価してもスコアに反映されない）ことが実機確認で判明。`D`（視聴深度）が0の
     場合のみ最低値`0.01`を保証する対応で解消（共通 信頼度スコアリングシステム仕様書 v1.2）。
   - 積み残し: `playlists.mylistCount`の集計が機能していない（未解決事項11参照）。
2. ~~**ゲームタイトル探す・詳細ページ**~~（`ページ ゲームタイトル 探す仕様書.md` /
   `ページ ゲームタイトル 詳細仕様書.md`）→ **2026-09-14対応済み**（コミット`500da42`）。
   - `/games`（キーワード検索・ジャンル絞り込みOR・タグ絞り込みAND・3種ソート・20件ページング・
     モバイル用アコーディオン検索パネル）、`/games/[gameId]`（パッケージ画像・楽天リンク・
     ジャンル/テーマ・再生リスト数/総動画数・タグ・説明文・関連する再生リスト一覧）。
   - 既存の`PlaylistGrid`を`PlaylistCardGrid`/`fetchPlaylistsByGame`/`sortPlaylists`に分解し、
     「再生リストを探す」仕様書と同一のカードを関連再生リストセクションで再利用。
   - 「情報を編集ボタン」（第7章・一般ユーザーの提案フロー）は審査ワークフロー未実装のため非表示
     （フェーズ2.5の「未実装機能は置かない」前例に合わせるユーザー合意）。
   - `/playlists/new`に`?gameId=`プレフィル対応を追加（詳細ページの「再生リストを追加する」から）。
   - **実機確認で見つかった修正**（いずれもユーザーフィードバック起点）: キーワード欄の×ボタン
     二重表示（`type="search"`→`"text"`）、適用中の検索条件がPC版で分かりにくい問題
     → 左カラムに常時チップ表示する`§4.7`を新設（ページ ゲームタイトル 探す仕様書 v1.3）、
     ジャンル・タグ絞り込みバッジの選択状態が分かりにくい問題 → `Tag`の淡いハイライトから
     境界線＋塗りつぶし＋チェックアイコンのトグルボタンに変更、`Tag`コンポーネント自体の
     「クリック不可な読み取り専用タグにまでホバー効果が付く」不備を修正（クリック可能な場合のみ
     ホバー効果を付ける。ゲームカード上のタグ等、他画面にも波及する共通コンポーネント修正）。
3. ~~**タグシステム**~~（`ページ ゲームタイトル 詳細仕様書.md`第8章 /
   `管理 マスタ管理仕様書.md`第2章）→ **2026-09-15対応済み**（コミット`8d17cd0`）。
   - `app/api/tags/attach`・`detach`（Admin SDK。`counters/tags`は管理者以外書き込み不可のため、
     `scripts/lib/tag-id.mjs`の`issueTagIds`トランザクションを再利用して新規タグを採番）、
     `components/tags/TagEditModal.tsx`（再生リスト・ゲームタイトル共通。モーダル内はローカル
     下書き編集→「保存する」で確定、1文字以上でタグマスタ前方一致サジェスト最大5件）。
   - 再生リスト詳細（`PlaylistInfoCard`）・ゲームタイトル詳細の両方に、ログイン時のみ表示される
     ✏️編集アイコンと実データ（`playlistTagIds`/`gameTagIds`）の購読表示を追加。これまで空表示
     （`tags={[]}`）だった再生リスト詳細のタグ欄が実際に機能するようになった。
   - 使用件数が0になったユーザータグは自動削除せずそのまま残す方針（運営者タグと同じ
     「マスタは基本永続」。0件タグの整理は将来の管理画面に委ねる、ユーザー合意）。
   - **ブラウザでの動作確認**: 2026-09-15、ユーザーが実ブラウザで確認済み。
4. ~~**「再生リストを探す」本実装**~~（`ページ 再生リストを探す 仕様書.md`）→ **2026-09-15対応済み**。
   `app/(main)/playlists/page.tsx`を`/games`（フェーズ3ステップ2）と同じ簡易実装方針（全件クライアント
   取得＋クライアント側フィルタ・ソート・ページング）で2カラム構成に差し替え。`components/playlists/PlaylistGrid.tsx`に
   `fetchPublicPlaylists`を追加し、`PlaylistCardGrid`のタグ表示をgameNameの仮置きから
   `playlistTagIds`/`playlistTagsFixed`の実データ（§3.5表示優先順位・`highlightTagIds`での太字強調）に
   置き換えた（フェーズ3ステップ3のタグシステム導入で解消）。キーワード検索はゲームタイトル・
   チャンネル名が対象（§4.2、再生リスト自身のタイトルは対象外）。タグ絞り込みの表示件数「実況スタイル系は
   全件、その他は上位5件」（§4.3）はカテゴリ情報がスキーマに無いため`/games`同様フラット一覧＋
   もっと見るで簡略化（既存のスコープ外方針を踏襲）。
   実ブラウザ（1440/390）でキーワード検索・フィルターチップ・リセットボタンの活性/クリア動作を確認済み
   （`scripts/dev/screenshot.mjs`使用）。タグ絞り込みパネルは、ステップ5の本番E2E確認で
   一時的にタグを付与して表示・選択・絞り込みまで動作確認済み（下記5.参照）。
5. ~~**仕上げ**~~ → **2026-09-15対応済み**。フェーズ2.5ステップ8と同内容（3幅目視確認・キーボード操作/aria・
   `npm run lint`/`tsc`/`build`・本番E2E確認）を、ステップ1〜4の全機能に対して実施。
   - **3幅確認（767/768/1600px）**: `/games` `/games/[gameId]` `/playlists` `/playlists/[playlistId]`を
     `scripts/dev/screenshot.mjs`で撮影。**768pxで再生リスト詳細ページの右カラムが横方向にオーバーフローする
     不具合を発見**（動画リストの項目テキストが折り返さず画面外へはみ出す）。原因はCSS Gridの仕様上、
     `md:grid-cols-[62fr_38fr]`の直下グリッドアイテムに`min-width:0`が無いと、子要素の内容的最小幅が
     トラック幅を押し広げてしまうこと。`app/(main)/playlists/[playlistId]/page.tsx`のグリッドアイテム
     （通常時2箇所・シアターモード時1箇所）に`min-w-0`を追加して解消。768px再撮影で解消を確認、
     767px/1600pxは元々問題なし。`/games`系・`/playlists`検索ページ（`md:grid-cols-[68fr_32fr]`）は
     同種の問題なし。
   - **キーボード操作・aria**: 新規追加ウィジェットはいずれも既存の共通部品（`Modal`＝タグ編集モーダル・
     ログイン要求モーダル、`SelectMenu`/`DropdownMenu`＝ソート）を再利用しており、フェーズ2.5ステップ8で
     確認済みの内容から変更なし。星評価（`StarRating`、フェーズ3ステップ1で新規追加）はフォーカス移動
     可能なボタンで構成され、共通の`:focus-visible`スタイル（globals.css §11.2）がそのまま適用される
     ことをコードで確認。未ログイン状態で星をクリックするとログイン要求モーダルが正しく表示される
     ことを実ブラウザで確認（レビュー投稿のログインガードが機能）。
   - **本番E2E確認**（一時テスト管理者アカウントで確認後に削除）: 実在の公開再生リストに管理者で
     タグ「QA検証用テストタグ」を新規追加→保存→`/playlists`の検索条件パネルにタグが出現→
     トグルボタンで選択→該当再生リストのみに絞り込まれる（1件）→カード自身にもタグが表示される、
     の一連を確認。確認後、同じ再生リストからタグを削除して保存し、`/playlists`のタグパネルから
     消えることを確認（0件になったタグ自体は仕様どおり`tags`マスタに残置。フェーズ3ステップ3の
     ユーザー決定を参照）。
   - `npm run lint` / `npx tsc --noEmit` / `npm run build` 成功（グリッド修正の反映後に再実行）。
   これでフェーズ3の全5ステップが完了。

フェーズ3で見送るもの: レビュー通報・再生リスト通報の処理（AI審査・オーナー承認）、ゲームタイトル
情報編集（管理者編集・一般ユーザー提案）、タグ絞り込みのカテゴリ分け（`tags`スキーマにカテゴリ
情報が無いため）、`playlists.mylistCount`の集計修正（未解決事項11、フェーズ3のスコープ外として
発見・記録のみ）。

### フェーズ4: 検証・本番デプロイ（2026-09-18〜19対応）

**前提**: フェーズ1〜3で行ってきた「本番環境で確認」は、すべて`npm run dev`のローカル実行から
本番Firebaseプロジェクト（Firestore/Authentication）へ直接接続して行ったものであり、Cloud Run
サービス`puremite`への実デプロイはv2立ち上げ以降フェーズ4で初めて実行された（実質**初回デプロイ**）。

**2026-09-18に対応済み**（コミット`8297a7e`〜`3eb7e95`）:
1. ~~ブロッカー2（`YOUTUBE_API_KEY`がデプロイ経路に乗っていない）~~ → 対応済み。publicリポジトリの
   ため`lib/constants.ts`への直書きは採らず、`deploy.sh`/`deploy.ps1`が`.env.local`から読み取り
   `gcloud run deploy --update-env-vars`で注入する方式にした。あわせてpackage-lock.json不整合
   （sharp-wasm32のoptional依存解決漏れ）とdeploy.ps1のフェイルファスト欠如も修正。
2. ~~stg・本番とも`deploy.ps1`で実際にデプロイ~~ → 対応済み。Cloud Runリビジョンで確認可能
   （stg: `puremite-00006`〜、本番: `puremite-00003`〜、いずれも2026-09-18作成）。
3. ~~Basic認証とBearer認証（Firebase IDトークン）の競合でstg APIが全滅していたバグ~~ → 対応済み。
   `proxy.ts`のBasic認証matcherから`/api`配下を除外（コミット`2ffbdd6`）。
4. ~~検証段階として全環境にnoindex・Basic認証を適用~~ → 対応済み（コミット`3eb7e95`）。
   `app/robots.ts`・`layout.tsx`のmetadata.robotsでnoindex、`proxy.ts`のBasic認証を
   stg限定から環境問わず適用に変更。本番Cloud Runにも同じBasic認証資格情報を設定済み。
5. フッターに管理者向け「再生リストを追加する」導線を追加（コミット`baf1538`）。

**2026-09-19に発見・対応済み**: 上記4のBasic認証適用後も、**本番カスタムドメイン
（`puremite.net`・`tr-game-streamer.web.app`）がBasic認証を素通りしてHTTP 200を返す**不具合を
発見。原因はNext.jsの静的ページのデフォルト`Cache-Control: s-maxage=31536000`（1年）を
Firebase HostingのCDN（Fastly）がそのままキャッシュ規則として使い、`proxy.ts`のミドルウェアが
実行されるCloud Run本体まで到達する前にエッジでレスポンスを返してしまっていたこと（Basic認証
導入**前**にキャッシュされた古いレスポンスが残り続けていた）。`firebase.json`のhosting設定に
`Cache-Control: private, no-store`を強制する`headers`ルールを追加し、stg・本番ともデプロイして
解消（`X-Cache: MISS`で毎回401が返ることを確認済み）。コード変更なし・Cloud Run再デプロイ不要、
Firebase Hostingの設定のみの反映。**正式公開でnoindex/Basic認証を外す際は、この`no-store`強制も
併せて見直すこと**（パフォーマンス目的のキャッシュを復活させるなら、静的アセット等の安全な範囲に
絞って再設計する）。

**積み残し（2026-09-20決定でフェーズ4.5へ移管）**:
1. **主要導線のE2E確認**（アカウント登録・ログイン、再生リスト登録、視聴・進捗、マイリスト、
   新着通知、レビュー・スコアリング、タグ、ゲームタイトル/再生リストを探す）を、実際にデプロイされた
   stg・本番のURL上でブラウザから通しで確認した記録がまだ無い。フェーズ1〜3のE2E確認はすべて
   `npm run dev`のローカル実行経由だったため、Cloud Run上でのビルド成果物としての動作確認が
   未了（YouTube IFrame Player APIのブラウザ実機確認も含む）。→ **フェーズ4.5ステップ1**で実施。
2. 未解決事項5（ステージング環境のリセット）が実際にどこまで反映済みかの棚卸し。stg・本番とも
   デプロイ・Basic認証適用は完了しているが、Firestoreルール・インデックス・マスタデータ・
   Authenticationプロバイダ設定がstg側で本番と一致しているかは今回未確認のまま。
   → **フェーズ4.5ステップ7**で実施。

**noindex・Basic認証を外すタイミングについて（2026-09-19ユーザー決定）**: かなり先の話とする。
友人へのデモ・SNSアカウント開設・販促関連タスク一式が完了した後。フェーズ4完了後はこの後続タスク
（デモ・SNS・販促、正式公開判断）について**まったく新しい計画を別途立てる**方針。

未解決事項3（BigQueryエクスポート拡張機能の扱い）・4（X/パスキー認証）・6（v1旧APIキー無効化）は
優先度が低く、フェーズ4を止める要因ではない。

### 未実装機能の棚卸し（2026-09-20時点）

フェーズ4終了を受けた計画見直し（2026-09-20）のために、`ページ一覧仕様書`と実装済みルートを
突き合わせた結果。フェーズ6以降の優先順位付けの土台にする。

**フロントページ**（`ページ一覧仕様書` 3.2節の28ページ中）:

| ページ | URL | 現状 |
|---|---|---|
| TOP | `/` | 最小版（新着の再生リストのみ）。ヒーロー／マイリスト／注目／タグピックアップが未実装 |
| チャンネルから探す | `/channels` | 準備中ページ（グローバルナビ4項目の1つ） |
| チャンネル詳細 | `/channels/[channelId]` | 未実装。再生リスト登録時の「流入元チャンネル一致判定」もこれ待ち |
| まとめ（探す・詳細） | `/collections` 他 | 準備中ページ。作成・編集・保存・プロフィール連携を含む |
| 視聴履歴 | `/history` | 準備中ページ（`watch_history`の記録自体は稼働中） |
| 設定 | `/settings` | 未実装 |
| プロフィール | `/profile/[userId]` | 未実装 |
| アカウント作成 | `/signup` | `/login?mode=signup`で代替中 |
| パスワード再設定 | `/password-reset` | 未実装（未解決事項8） |
| 初めての方へ／このサイトについて | `/about`・`/site-info` | 未実装（フッターリンクが404） |
| お問い合わせ／履歴 | `/contact`・`/contact/history` | 未実装（404） |
| 利用規約／プライバシーポリシー | `/terms`・`/privacy` | 未実装（404）。**アカウント作成画面の同意リンク先が404** |
| 403 / 503 | — | 未実装（404・500は実装済み。`ErrorContent`は再利用可） |

**管理画面**: `/admin`配下14ページ・仕様書9本すべて未着手。現在の管理操作は`/playlists/new`と
`/notifications`内の管理者用「再取得」ボタンの2つのみ。

**機能・基盤**:
- 新着取得バッチの自動化（Cloud Functions/Scheduler未導入、管理者の手動ボタンのみ）。
  `共通 youtube定期取得仕様書`のRSS優先・APIフォールバックも未実装
- **ゲームタイトルを追加する手段がUI上に無い**（`scripts/data/test-games.mjs`の書き換えのみ）
- 楽天ブックスAPI連携（パッケージ画像・新作検知）未実装
- 審査ワークフロー（通報レコードは作られるが処理する画面が無い。ゲーム情報編集提案も同様）
- 通知4種別のうち3種別（お知らせ・審査結果・お問い合わせ返信）、FCMプッシュ基盤、90日自動削除バッチ
- AI運営者（コンテンツ収集・新作検知・Gemini説明文生成）
- 一般ユーザーの再生リスト登録／提案フロー（現状は管理者専用）
- `playlists.mylistCount`の集計（未解決事項11。カード表示が常に0）
- ゲストの視聴進捗LocalStorage保存／ログイン状態維持（未解決事項9）／X・パスキー認証（未解決事項4）
- 通知ドロップダウン・インフォメーションバー

### フェーズ4.5: ドッグフーディング準備（2026-09-20計画）

**背景**: フェーズ4終了時点で、コアループ（登録→視聴→マイリスト→新着通知→レビュー・タグ）は
一通り動く。ここで**ユーザー自身が実際に使い込み、その気づきから改善する期間**を設ける方針を
ユーザーと合意した（2026-09-20）。ただし今すぐ始めると、上がってくる気づきの上位が「既に分かって
いる未実装」で埋まり、テスト期間の情報価値が落ちる。そこで「**自分ひとりが本番URLで毎日使い
続けられる**」ために本当に必要な項目だけを、この短いフェーズで先に潰す。

**ゴール**: ①本番に常用アカウント（owner）がある ②見たい実況を自分で最後まで登録できる
③新着が自動で検知され通知が届く ④マイページ導線が準備中ページでない ⑤目に見える既知バグが無い

**このフェーズで**やらない**もの**（フェーズ6以降へ）: チャンネル・まとめ・プロフィール・TOP本実装・
管理画面・法務ページ・楽天API連携。「実際に使って必要だと感じた順」で入れるほうが無駄が少ない。

1. ~~**デプロイ済み環境のE2E確認と常用アカウント整備**~~（フェーズ4積み残し1）→ **2026-09-20対応済み**。
   最初に置く理由は、ここで出る不具合が後続ステップの前提を壊しうるため。
   - `scripts/set-role.mjs`（新規）— メール指定でCustom Claim `role`と`users.role`を更新。
     **現状ownerに昇格させる手段がコードに一切無い**（`api/auth/init-user`は`user`固定、
     `api/test/sign-in`はテスト用会員専用）ため、このままでは本番で再生リストを登録できない。
     `scripts/lib/firebase-admin.mjs`に`initAuth`を追加（既存`initFirestore`と同じADC方式）。
   - 本番に常用アカウント（メールアドレスは伏字、実際の連絡先は口頭で共有済み）を作成
     → `set-role.mjs`でowner付与。
   - Playwright MCPで`puremite.net`の主要導線を通した（既存の登録済み3件の再生リストを使用。
     新規`/playlists/new`登録はユーザー判断でスキップ）: サインアップ→ログイン／詳細ページで
     **実際に動画再生**（YouTube IFrame Player APIの実機確認、フェーズ2から未消化だった）・
     「次へ」による連続再生・`watch_progress`/`watch_history`への進捗保存（Firestore書き込みを
     ネットワークログで確認）／マイリスト追加・ステータス変更／レビュー投稿（★評価・コメント）＋
     参考になった／タグ付与＋`/playlists`でのタグ絞り込み／管理者用「新着動画を再取得」
     （3件確認・新着0件、エラーなしで正常終了）。
   - **重要な副作用の発見**: Basic認証を`https://user:pass@puremite.net/`のようにURLへ埋め込む
     方式で確認を始めたところ、**アプリ自身の相対パスfetch（`/api/reviews/upsert`等）が
     ブラウザの仕様で例外を起こし全滅する**ことが判明（`document.baseURI`が認証情報を含むと、
     そこから解決される相対URLでの`fetch()`をFetch仕様が拒否するため。エラーメッセージ:
     `Request cannot be constructed from a URL that includes credentials`）。実ユーザーは
     ブラウザ標準のBasic認証ダイアログを使うためこの問題は起きない、**Playwright自動操作固有の
     罠**。今後同様の自動操作を行う際は、URL埋め込みではなく`page.route()`で`Authorization`
     ヘッダーを注入する方式を使うこと（ただし`/api`配下は`proxy.ts`でBasic認証対象外なので、
     appのBearerトークンを上書きしないよう「既にAuthorizationヘッダーがある場合は触らない」
     条件を必ず入れる）。
   - **この副作用に起因する実データの不整合**: 上記の罠により、常用アカウントの新規登録直後の
     `/api/auth/init-user`呼び出しが失敗し、`users/{uid}`ドキュメントが作成されないまま
     `set-role.mjs`の`merge:true`書き込みで`role`フィールドだけが存在する不完全な状態になった。
     さらに`init-user`は`customClaims.role`が既にセットされていると早期returnして
     ドキュメント作成処理をスキップする設計のため、後から呼び直しても直らない
     （`displayName`等が無いため、レビュー一覧の投稿者名が「ユーザー」フォールバック表示になる
     副作用を確認済み）。`displayName`はfirestore.rulesの本人更新許可フィールドのため
     `/settings`実装後（ステップ6）に本人が入力すれば直る想定。`isAI`/`isBanned`等の管理項目は
     Admin SDKでの補修が必要だが、本セッションでは本番Admin SDK書き込みの追加承認が得られず
     未実施（**積み残し**、下記参照）。
   - **本番データの扱いを転換（2026-09-20ユーザー決定）**: これまではE2Eのたびに本番データを
     全削除してきたが、ここからは**残す**。削除するのはテスト用会員（`test-user@puremite.test`・
     `test-admin@puremite.test`）のみ。今回登録したレビュー・マイリスト・タグ（オープンワールド）は
     実データとして残置。
2. **ゲームタイトル追加UI（管理者）**
   `games`は現在5件で、追加手段は`scripts/data/test-games.mjs`の書き換えのみ。コンテンツが
   貯まらない最大の原因。
   - `app/api/admin/games`（POST・`requireAdmin`）— title必須、genre/theme/platforms/
     packageImageUrl/rakutenUrl/description任意、同名重複チェック。
   - `components/games/GameCreateModal.tsx` — `GameSelectModal`のフッターから開く。管理者のみ表示
     （一般ユーザー向けの「提案」は審査ワークフロー依存のため引き続き非表示）。
   - パッケージ画像はURL手入力で代替（表示は`<img>`直参照のため設定変更不要）。楽天ブックス
     API連携はフェーズ6以降。
   - **仕様書更新が必要**: `ページ 再生リストを追加する 仕様書`§4.2.2（管理者は提案でなく直接追加）、
     `管理 マスタ管理仕様書`§7.1（JANコード自動取得なしの暫定手入力版である旨）。
3. **`playlists.mylistCount`の集計修正**（未解決事項11）
   - 原因確定: `mylist`の作成・削除がクライアントSDK直で、カウントを増減する処理がどこにも無い。
     `playlists`のupdateルールは一般ユーザーに`playlistTagIds`のみ許可しているため、
     **クライアントからは構造的に増減できない**。
   - 追加・削除だけAdmin SDK API（`app/api/mylist`、`FieldValue.increment`）に寄せる。ステータス
     変更・逆順トグルはカウントに影響しないのでクライアントSDKのまま。
   - `app/api/reviews/upsert`のmylist自動作成経路にもincrementを追加。
   - `scripts/recount-mylist.mjs`（新規・冪等）で既存のズレを数え直す。
4. **新着通知の自動実行**
   サービスの中核価値であり、手動ボタンのままでは「通知で気づく」体験自体を検証できない。
   - `app/api/admin/refresh-new-videos`にcron経路を追加 — `X-Cron-Secret`ヘッダーが環境変数
     `CRON_SECRET`と一致すれば`requireAdmin`をスキップ。`/api`は`proxy.ts`のBasic認証対象外の
     ため、Cloud Run URLを直接叩ける。
   - `deploy.ps1`/`deploy.sh`に`CRON_SECRET`注入を追加（`.env.local`から読む、`YOUTUBE_API_KEY`と
     同じ方式）。`SECRET_MANAGEMENT.md`に追記。
   - Cloud Scheduler（asia-northeast1、日1回・JST 6:00、本番のみ）。
   - `batch_logs`（DB設計書3.21に定義済み・未使用）に実行結果を1件記録する。テスト期間中に
     「バッチが動いたのか」を確認する手段が無いと困るため。
   - クォータは 再生リスト数×2ユニット程度/日で、上限10,000に対して余裕がある。
5. **`/history`本実装**
   土台は揃っている（`watch_history`のスキーマ・ルール・複合インデックス`userId + watchedAt DESC`、
   書き込みもプレーヤーが実施中）。
   - 2カラム（左=日付グルーピング一覧、右=キーワード検索・日付フィルタ・全削除）、カード
     （サムネ＋進捗バー＋タイトル＋チャンネル＋⋮メニュー）、空状態。
   - タイトル/サムネ/チャンネル名は`watch_history`に持たないため`videos`/`playlists`/`channels`
     から合成する。
   - **見送り**（仕様書に明記して見送る）: 未ログイン時のLocalStorage記録とログイン時マージ
     （§7.2・§7.3。プレーヤー側もゲスト進捗未対応）、カレンダーピッカーは依存追加を避け
     `<input type="date">`で代替。
6. **`/settings`最小版**
   - 入れる: 表示名変更／連続再生（`isContinuousPlayEnabled`）／ネタバレレビュー非表示
     （`hideSpoilerReviews`）／マイリスト新着通知（`showNewArrivalNotification`）／ログアウト。
   - 入れない: メール・パスワード変更（再認証フローが必要）、パスキー（未解決事項4）、FCMプッシュ
     （基盤未実装）、退会（削除ポリシーの実装が必要）、お問い合わせ（`/contact`未実装）、
     マイリスト・レビュー履歴の公開設定（プロフィールページが無く効果が見えないため。
     「未実装機能は置かない」前例に合わせる）。
   - 導線: ユーザードロップダウンに「設定」を追加。ボトムタブ「マイページ」の遷移先は`/history`の
     まま確定（未解決事項7の宿題をここで解消）。
   - 表示名変更はプロフィール仕様書からの前倒しのため、`ページ 設定 仕様書`に暫定実装範囲を追記。
7. **仕上げ**
   - 3幅（767/768/1600px）目視・キーボード操作/aria・`npm run lint`/`npx tsc --noEmit`/`npm run build`。
   - stg・本番へデプロイ、Cloud Schedulerを本番に設定。
   - **stg環境の棚卸し**（フェーズ4積み残し2）— Firestoreルール・インデックス・マスタデータ・
     Authenticationプロバイダ設定を本番と突き合わせる。
   - Wiki記録（`wiki/sources/`）＋本ドキュメント更新。

**見積**: 7セッション前後（ステップ1・2・4が重め）。

### フェーズ5: 自己ユーザーテスト期間（2026-09-20計画）

**やること**: ユーザー自身が実際に使う。気づいたらその場で伝える。直せるものはその場で直す。
**厳密な手順・ノルマ・記録フォーマットは定めない**（2026-09-20ユーザー決定。記録の負担で
テストが止まるのが一番まずいため）。

- 環境は本番（`puremite.net`、Basic認証・noindex継続）。**登録した再生リストも視聴履歴も消さない**。
  stgは壊す用に残し、スキーマ変更や再カウントのような本番データを触る修正は先にstgで試す。
- 期間は決め打ちしない。一通り使って気づきが出尽くしてきた時点で振り返り、フェーズ6へ。
- その場で直せないもの（画面を新規に作る必要があるもの・設計から考え直すもの）だけ、本ドキュメントの
  「未解決事項」に1行ずつ積む。専用の記録ファイルは作らない。
- **デプロイの回し方**: 本番URLで使う以上、修正の反映にはデプロイが要る。実装中の確認は
  `npm run dev`（ローカル→本番Firestore接続、これまでと同じ）で行い、デプロイは区切りのいい
  ところでまとめて実施する（急ぎのものは都度）。
- 意識しないと自分では通らない経路が2つある: **スマホからの視聴**と**レビュー投稿**。この2つだけは
  どこかで触っておくと気づきが出やすい。

### フェーズ6: 気づきベースの改善（フェーズ5の振り返りで計画する）

フェーズ5で溜まった未解決事項と、上記「未実装機能の棚卸し」を並べ直す。**仕様書の順ではなく、
実際に使ってみて「無くて困った順」**で優先順位を付ける。候補は TOP本実装・チャンネル・まとめ・
プロフィール・楽天ブックスAPI連携・管理画面の最小版など。

### フェーズ7: 友人デモ前の最低ライン

他人に触らせるために必要なもの。フェーズ6と並行・前後する可能性あり。
- `/terms`・`/privacy`（**アカウント作成画面の同意リンクが404のままでは他人に使わせられない**）
- `/about`・`/site-info`・`/contact`・`/password-reset`（未解決事項8）
- 一般ユーザーの再生リスト登録または提案フロー（現状は管理者専用のため、友人は追加ができない）
- 通報の受け皿（審査ワークフロー最小版）

### フェーズ8: 販促・正式公開判断

友人へのデモ、SNSアカウント開設、販促関連タスク、noindex/Basic認証の解除判断
（解除時は`firebase.json`の`no-store`強制の見直しもセットで行う。フェーズ4の記述を参照）。
2026-09-19時点でまだ計画未着手。フェーズ6・7の進捗を見て別途計画を立てる。

### 将来構想

AI運営者・信頼度スコアリング本格運用 → 格付けサイトへの転換、BigQuery/Terraform導入、
iOS/Androidネイティブアプリ展開。

## 参考: 主要ドキュメントの場所

- 全体像: `document/specification/仕様書トレーサビリティ・マトリクス.md`
- ページ一覧: `document/specification/page/ページ一覧仕様書.md`
- Firestoreデータモデル: `document/specification/db/Firestoreデータモデル設計書.md`
- 技術スタック: `document/specification/common/技術スタック仕様書.md`
- 開発フロー規約: `.agent/rules/development_flow.md`
- 秘密情報管理方針: `SECRET_MANAGEMENT.md`
