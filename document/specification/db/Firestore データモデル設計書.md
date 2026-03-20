# プレミテ Firestore データモデル設計書

**バージョン**: v1.1  
**作成日**: 2026年3月20日  
**対象**: 開発チーム  
**関連ドキュメント**: プレミテ企画書 / プレミテ_技術スタック仕様書 / 各機能仕様書

---

## 目次

1. [概要・設計方針](#1-概要設計方針)
2. [コレクション一覧](#2-コレクション一覧)
3. [コレクション詳細定義](#3-コレクション詳細定義)
   - 3.1 [users](#31-users)
   - 3.2 [playlists](#32-playlists)
   - 3.3 [videos](#33-videos)
   - 3.4 [channels](#34-channels)
   - 3.5 [games](#35-games)
   - 3.6 [genres](#36-genres)
   - 3.7 [themes](#37-themes)
   - 3.8 [tags](#38-tags)
   - 3.9 [reviews](#39-reviews)
   - 3.10 [helpful_votes](#310-helpful_votes)
   - 3.11 [mylist](#311-mylist)
   - 3.12 [watch_progress](#312-watch_progress)
   - 3.13 [watch_history](#313-watch_history)
   - 3.14 [collections](#314-collections)
   - 3.15 [workflows](#315-workflows)
   - 3.16 [notices](#316-notices)
   - 3.17 [inquiries](#317-inquiries)
   - 3.18 [operation_logs](#318-operation_logs)
   - 3.19 [admin_notifications](#319-admin_notifications)
   - 3.20 [fraud_alerts](#320-fraud_alerts)
   - 3.21 [batch_logs](#321-batch_logs)
   - 3.22 [api_quota_logs](#322-api_quota_logs)
   - 3.23 [collection_candidates](#323-collection_candidates)
   - 3.24 [collection_batch_logs](#324-collection_batch_logs)
   - 3.25 [collection_quota_logs](#325-collection_quota_logs)
   - 3.26 [genre_search_keywords](#326-genre_search_keywords)
   - 3.27 [ai_operators](#327-ai_operators)
   - 3.28 [ng_words](#328-ng_words)
   - 3.29 [app_settings](#329-app_settings)
4. [リレーション図](#4-リレーション図)
5. [インデックス設計](#5-インデックス設計)
6. [セキュリティルール方針](#6-セキュリティルール方針)
7. [データ整合性・削除ポリシー](#7-データ整合性削除ポリシー)
8. [改訂履歴](#8-改訂履歴)

---

## 1. 概要・設計方針

### 1.1 データベース概要

| 項目 | 内容 |
|------|------|
| DB種別 | Firestore（Native Mode） |
| データモデル | NoSQLドキュメント型 |
| 認証連携 | Firebase Authentication（`uid` をドキュメントIDとして使用） |

### 1.2 設計方針

**参照の非正規化（denormalization）**  
Firestoreはテーブル結合（JOIN）ができないため、一覧表示やカード表示に頻繁に使う情報は参照先コレクションから代表フィールドをコピーして保持する（例：`playlists` ドキュメントにチャンネル名・ゲームタイトル名をキャッシュ）。

**カウンターフィールドの維持**  
コレクションを都度集計するクエリはコストが高いため、頻繁に参照するカウント値（マイリスト登録数・レビュー数・参考になった数）は親ドキュメントにフィールドとして保持し、Cloud Functions または Client-Side で更新する。

**ロールはカスタムクレームで管理**  
`owner` / `operator` / `ai_operator` のロール判定は Firebase Authentication のカスタムクレーム（Custom Claims）で行う。Firestore の `users` ドキュメントにも `role` フィールドを持たせ、管理画面の一覧表示用途に使用する。

**コレクションIDの命名**  
スネークケース（`snake_case`）で統一する。

---

## 2. コレクション一覧

| # | コレクションID | 用途 | 主な仕様書参照 |
|---|--------------|------|--------------|
| 1 | `users` | ユーザーアカウント情報 | プロフィールページ仕様書 / アカウント登録ログイン仕様書 / 設定ページ仕様書 |
| 2 | `playlists` | 再生リスト（ゲーム実況シリーズ） | 再生リストを探す仕様書 / 再生リスト詳細ページ仕様書 |
| 3 | `videos` | 再生リストに属する動画 | 動画プレーヤー仕様書 / YouTube定期取得仕様書 |
| 4 | `channels` | YouTubeチャンネル | チャンネル詳細ページ仕様書 / マスタ管理仕様書 |
| 5 | `games` | ゲームタイトルマスタ | ゲームタイトル詳細ページ仕様書 / マスタ管理仕様書 |
| 6 | `genres` | ゲームジャンルマスタ（楽天ブックス第4階層） | マスタ管理仕様書 |
| 7 | `themes` | ゲームテーママスタ（楽天ブックス第5階層） | マスタ管理仕様書 |
| 8 | `tags` | タグマスタ（再生リスト・ゲームタイトル共通） | マスタ管理仕様書 |
| 9 | `reviews` | レビュー投稿データ | レビュー投稿機能仕様書 / 信頼度スコアリングシステム仕様書 |
| 10 | `helpful_votes` | 「参考になった」投票記録 | レビュー投稿機能仕様書 |
| 11 | `mylist` | マイリスト登録データ | マイリスト機能仕様書 |
| 12 | `watch_progress` | 動画ごとの視聴進捗 | 動画プレーヤー仕様書 |
| 13 | `watch_history` | 動画視聴履歴 | 視聴履歴機能仕様書 |
| 14 | `collections` | まとめ（ユーザー作成のキュレーション） | まとめ機能仕様書 |
| 15 | `workflows` | 審査ワークフロー（提案・通報） | 審査ワークフロー仕様書 |
| 16 | `notices` | お知らせ（管理者→ユーザー向け） | お知らせ管理仕様書 |
| 17 | `inquiries` | お問い合わせ・チャットスレッド | お問い合わせ管理仕様書 |
| 18 | `operation_logs` | 管理画面操作ログ | 操作ログ仕様書 |
| 19 | `admin_notifications` | 管理者向け内部通知 | モニタリング仕様書 / AI運営者審査仕様書 |
| 20 | `fraud_alerts` | 不正レビュー検知アラート | モニタリング・不正監視仕様書 |
| 21 | `batch_logs` | YouTube定期取得バッチ実行ログ（Function A/B） | YouTube定期取得仕様書 |
| 22 | `api_quota_logs` | YouTube APIクォータ消費ログ（Function A/B） | モニタリング仕様書 |
| 23 | `collection_candidates` | AI運営者が収集した再生リスト候補 | AI運営者コンテンツ収集仕様書 |
| 24 | `collection_batch_logs` | コンテンツ収集バッチ実行ログ（Function C） | AI運営者コンテンツ収集仕様書 |
| 25 | `collection_quota_logs` | コンテンツ収集APIクォータ消費ログ | AI運営者コンテンツ収集仕様書 |
| 26 | `genre_search_keywords` | AI運営者が使用するジャンル別検索キーワード | AI運営者コンテンツ収集仕様書 |
| 27 | `ai_operators` | AI運営者（AIキャラクター）の設定情報 | ユーザー管理仕様書 / AI運営者審査仕様書 |
| 28 | `ng_words` | NGワードマスタ | マスタ管理仕様書 |
| 29 | `app_settings` | アプリ全体の設定値（閾値など） | モニタリング仕様書 |

---

## 3. コレクション詳細定義

### 凡例

| 表記 | 意味 |
|------|------|
| `string` | 文字列 |
| `number` | 数値 |
| `boolean` | 真偽値 |
| `Timestamp` | Firestore Timestamp |
| `string[]` | 文字列配列 |
| `map` | オブジェクト（Firestoreのマップ型） |
| `null` | null値 |
| `?` | 任意フィールド（存在しない場合あり） |

---

### 3.1 `users`

一般ユーザー・管理者・AIキャラクターすべてのアカウント情報を統合して管理する。ドキュメントIDはFirebase AuthenticationのUID。

**パス**: `users/{userId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `uid` | string | ✅ | Firebase Auth UID（ドキュメントIDと同一） |
| `displayName` | string | ✅ | ユーザー名（1〜30文字） |
| `email` | string | ✅ | メールアドレス（管理者のみ公開。一般ユーザーは非公開） |
| `profileImageUrl` | string? | — | プロフィール画像のURL |
| `bio` | string? | — | 自己紹介文（最大200文字） |
| `role` | string | ✅ | `"user"` / `"operator"` / `"owner"` / `"ai_operator"` |
| `isAI` | boolean | ✅ | AI運営者フラグ。`role = "ai_operator"` のとき `true` |
| `isBanned` | boolean | ✅ | BANフラグ（デフォルト：`false`） |
| `banReason` | string? | — | BAN理由（任意） |
| `bannedAt` | Timestamp? | — | BAN設定日時 |
| `isTestUser` | boolean | ✅ | テストモード用会員フラグ（デフォルト：`false`） |
| `fcmTokens` | string[] | ✅ | FCMプッシュ通知トークン一覧（複数デバイス対応） |
| `isMylistPublic` | boolean | ✅ | マイリストの公開設定（デフォルト：アカウント作成時にユーザーが選択） |
| `isReviewHistoryPublic` | boolean | ✅ | レビュー履歴の公開設定（デフォルト：アカウント作成時にユーザーが選択） |
| `showNewArrivalNotification` | boolean | ✅ | マイリストの新着通知表示設定（デフォルト：`true`） |
| `reviewCount` | number | ✅ | レビュー投稿数（集計キャッシュ、デフォルト：0） |
| `helpfulReceivedCount` | number | ✅ | 「参考になった」被獲得数合計（集計キャッシュ、デフォルト：0） |
| `accountCreatedAt` | Timestamp | ✅ | アカウント作成日時 |
| `lastLoginAt` | Timestamp? | — | 最終ログイン日時 |

> **設計注記**  
> - `role` はFirebase Custom Claimsにも同値を設定し、セキュリティルールの判定に使用する。Firestoreの `role` フィールドは管理画面の一覧表示用。  
> - 管理者（owner/operator）のアカウントもこのコレクションで管理する。  
> - AIキャラクターのアカウントも `isAI: true` として同コレクションで管理。詳細設定は `ai_operators` コレクションに持つ。

---

### 3.2 `playlists`

プレミテに登録されたゲーム実況再生リストの情報。

**パス**: `playlists/{playlistId}`

> ドキュメントIDはYouTubeの再生リストID（`PLxxxxxxxx` 形式）をそのまま使用する。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `youtubePlaylistId` | string | ✅ | YouTubeの再生リストID（ドキュメントIDと同一） |
| `title` | string | ✅ | 再生リストのタイトル |
| `thumbnailUrl` | string | ✅ | YouTubeから取得したサムネイルURL |
| `channelId` | string | ✅ | 紐づくチャンネルのドキュメントID |
| `channelName` | string | ✅ | チャンネル名（denormalized） |
| `channelIconUrl` | string | ✅ | チャンネルアイコンURL（denormalized） |
| `gameId` | string? | — | 紐づくゲームタイトルのドキュメントID（未登録の場合はnull） |
| `gameName` | string? | — | ゲームタイトル名（denormalized） |
| `gameGenreIds` | string[] | ✅ | ゲームのジャンルIDリスト（ランキング・フィルタ用） |
| `videoCount` | number | ✅ | 動画数（YouTubeから取得） |
| `latestVideoPublishedAt` | Timestamp? | — | 最新動画の公開日時（新着順ソート用） |
| `registeredAt` | Timestamp | ✅ | プレミテへの登録日時 |
| `registeredBy` | string | ✅ | 登録した管理者のuserId |
| `isPublic` | boolean | ✅ | 公開フラグ（`false` = 論理削除） |
| `score` | number? | — | 信頼度加重平均スコア（5点満点、レビュー0件の場合は `null`） |
| `reviewCount` | number | ✅ | レビュー数（集計キャッシュ、デフォルト：0） |
| `mylistCount` | number | ✅ | マイリスト登録数（集計キャッシュ、デフォルト：0） |
| `playlistTagIds` | string[] | ✅ | 付与されたタグIDリスト |
| `playlistTagsFixed` | string[] | ✅ | 固定タグIDリスト（ユーザーが外せないもの） |
| `referenceUrl` | string | ✅ | YouTube再生リストの元URL |
| `lastFetchedAt` | Timestamp? | — | Function Aによる最終更新日時 |

---

### 3.3 `videos`

各再生リストに属する動画の情報。

**パス**: `videos/{videoId}`

> ドキュメントIDはYouTubeの動画ID（`dQw4w9WgXcQ` 形式）。ただし同一動画が複数の再生リストに属するケースがあるため、IDは `{youtubeVideoId}_{playlistId}` 形式を検討すること。  
> **採用方針**: 動画はプレイリスト単位で管理する（再生リストごとに独立したドキュメント）。ドキュメントIDは `{playlistId}_{position}` または `{playlistId}_{youtubeVideoId}` のいずれかを実装時に決定すること。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `youtubeVideoId` | string | ✅ | YouTubeの動画ID |
| `playlistId` | string | ✅ | 所属する再生リストのドキュメントID |
| `position` | number | ✅ | 再生リスト内の順番（0始まり） |
| `title` | string | ✅ | 動画タイトル |
| `thumbnailUrl` | string | ✅ | サムネイルURL |
| `durationSeconds` | number? | — | 動画の長さ（秒）。取得できない場合はnull |
| `publishedAt` | Timestamp | ✅ | YouTube上の公開日時 |
| `playStartCount` | number | ✅ | 再生開始回数（週間ランキングの集計元） |

> **設計注記**  
> 再生開始は動画プレーヤーで再生ボタンが押されたタイミングで `playStartCount` をインクリメントする。週次バッチで集計し `weekly_ranking_snapshots` に書き込む。

---

### 3.4 `channels`

YouTubeチャンネルの情報。

**パス**: `channels/{channelId}`

> ドキュメントIDはYouTubeのチャンネルID（`UCxxxxxxxx` 形式）をそのまま使用する。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `youtubeChannelId` | string | ✅ | YouTubeチャンネルID（ドキュメントIDと同一） |
| `name` | string | ✅ | チャンネル名 |
| `iconUrl` | string | ✅ | チャンネルアイコンURL |
| `description` | string? | — | チャンネル説明文（AI生成または手入力） |
| `isAiGeneratedDescription` | boolean | ✅ | 説明文がAI生成かどうかのフラグ |
| `subscriberCount` | number? | — | 登録者数（Function Bで週次更新） |
| `playlistCount` | number | ✅ | プレミテに登録された再生リスト数（集計キャッシュ） |
| `registeredAt` | Timestamp | ✅ | プレミテへの登録日時 |
| `lastFetchedAt` | Timestamp? | — | Function Bによる最終更新日時 |

---

### 3.5 `games`

ゲームタイトルマスタ。楽天ブックスAPIから取得した情報をベースに管理。

**パス**: `games/{gameId}`

> ドキュメントIDはFirestoreの自動採番IDを使用する。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `rakutenItemCode` | string? | — | 楽天ブックスのitemCode（ASIN相当） |
| `title` | string | ✅ | ゲームタイトル名 |
| `packageImageUrl` | string? | — | 楽天ブックスから取得したパッケージ画像URL（縦長） |
| `rakutenUrl` | string? | — | 楽天ブックスの商品ページURL（アフィリエイト導線） |
| `description` | string? | — | ゲーム説明文（楽天ブックスから取得またはAI生成） |
| `isAiGeneratedDescription` | boolean | ✅ | 説明文がAI生成かどうかのフラグ |
| `platforms` | string[] | ✅ | 対象プラットフォーム（例：`["Nintendo Switch", "PS5"]`） |
| `genreId` | string? | — | 紐づくジャンルID（`genres` コレクション） |
| `genreName` | string? | — | ジャンル名（denormalized） |
| `themeIds` | string[] | ✅ | 紐づくテーマIDリスト（`themes` コレクション） |
| `gameTagIds` | string[] | ✅ | 付与されたタグIDリスト |
| `gameTagsFixed` | string[] | ✅ | 固定タグIDリスト |
| `playlistCount` | number | ✅ | 紐づく再生リスト数（集計キャッシュ） |
| `createdAt` | Timestamp | ✅ | マスタへの登録日時 |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

---

### 3.6 `genres`

ゲームジャンルマスタ（楽天ブックスカテゴリ第4階層）。

**パス**: `genres/{genreId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `name` | string | ✅ | ジャンル名（例：「RPG」「アクション」） |
| `rakutenCategoryId` | string? | — | 楽天ブックスのカテゴリID |
| `gameTitleCount` | number | ✅ | 紐づくゲームタイトル数（集計キャッシュ） |
| `createdAt` | Timestamp | ✅ | 登録日時 |

> **設計注記**: ジャンル作成時にAIキャラクター（`{ジャンル名}審査AI`）が自動生成される。そのAIキャラクターは `users` および `ai_operators` コレクションに別途保存される。

---

### 3.7 `themes`

ゲームテーママスタ（楽天ブックスカテゴリ第5階層）。

**パス**: `themes/{themeId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `name` | string | ✅ | テーマ名（例：「冒険」「ダンジョン」） |
| `rakutenCategoryId` | string? | — | 楽天ブックスのカテゴリID |
| `gameTitleCount` | number | ✅ | 紐づくゲームタイトル数（集計キャッシュ） |
| `createdAt` | Timestamp | ✅ | 登録日時 |

---

### 3.8 `tags`

再生リスト・ゲームタイトル共通のタグマスタ。

**パス**: `tags/{tagId}`

> タグIDは `TAG-{連番}` 形式（例：`TAG-001`）。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `tagId` | string | ✅ | タグID（ドキュメントIDと同一、`TAG-{連番}` 形式） |
| `name` | string | ✅ | タグ名 |
| `origin` | string | ✅ | 出自：`"operator"` / `"user"` |
| `usagePlaylistCount` | number | ✅ | 再生リストへの付与件数（集計キャッシュ） |
| `usageGameCount` | number | ✅ | ゲームタイトルへの付与件数（集計キャッシュ） |
| `createdAt` | Timestamp | ✅ | 登録日時 |
| `createdBy` | string? | — | 作成者のuserId（ユーザータグのみ。運営者タグはnull） |

---

### 3.9 `reviews`

ユーザーが投稿したレビュー情報。「再生リスト単位」のレビュー。1ユーザー×1再生リストで1件。

**パス**: `reviews/{reviewId}`

> ドキュメントIDはFirestoreの自動採番ID。`userId` と `playlistId` の複合インデックスで一意性を担保する。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | 投稿者のuserId |
| `playlistId` | string | ✅ | 対象再生リストのドキュメントID |
| `starRating` | number? | — | 星評価（0.5〜5.0、0.5刻み）。未設定の場合はnull |
| `watchStatus` | string? | — | 視聴ステータス：`"want_to_watch"` / `"watching"` / `"reviewing"` / `"completed"` / `"on_hold"` / `"dropped"` |
| `comment` | string? | — | レビューコメント（任意） |
| `hasSpoiler` | boolean | ✅ | ネタバレフラグ（デフォルト：`false`） |
| `helpfulCount` | number | ✅ | 「参考になった」獲得数（変数H、デフォルト：0） |
| `trustScore` | number? | — | 信頼度スコア（変数W、バッチまたはリアルタイムで算出） |
| `watchDepth` | number? | — | 視聴深度（変数D、0.0〜1.0）。`watchStatus` が `"completed"` の場合は1.0固定 |
| `lastOpenedEpisode` | number? | — | 最後に開いた話数（`watch_progress` からの参照値） |
| `genreExpertiseScore` | number? | — | ジャンル専門性スコア（変数G、算出時点のスナップショット） |
| `commentScore` | number? | — | コメント文字数スコア（変数C、0.2/0.5/1.0） |
| `postedAt` | Timestamp | ✅ | 初回投稿日時 |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

> **設計注記**  
> - レビューが存在しない状態でもマイリスト登録（`mylist`）は行えるため、`reviews` ドキュメントとは独立している。  
> - `starRating` が null のレビューはシリーズスコアの加重平均計算対象外。ただしレビュー件数には含める。  
> - `trustScore` はシリーズスコア再計算バッチ（または投稿・更新時のCloud Functions）で更新する。

---

### 3.10 `helpful_votes`

「参考になった」ボタンの押下記録。1ユーザー×1レビューで1件。重複防止に使用する。

**パス**: `helpful_votes/{voteId}`

> ドキュメントIDは `{userId}_{reviewId}` 形式を使用する。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | 投票したユーザーのuserId |
| `reviewId` | string | ✅ | 対象レビューのドキュメントID |
| `votedAt` | Timestamp | ✅ | 投票日時 |

---

### 3.11 `mylist`

ユーザーのマイリスト登録情報。1ユーザー×1再生リストで1件。

**パス**: `mylist/{mylistId}`

> ドキュメントIDは `{userId}_{playlistId}` 形式を使用する。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | ユーザーのuserId |
| `playlistId` | string | ✅ | 登録した再生リストのドキュメントID |
| `watchStatus` | string | ✅ | 視聴ステータス：`"want_to_watch"` / `"watching"` / `"completed"` / `"on_hold"` / `"dropped"` |
| `isReverseOrder` | boolean | ✅ | 逆順トグルのON/OFF設定（デフォルト：`false`） |
| `lastPlayedVideoId` | string? | — | 最後に開いた動画のdocumentId（`videos` コレクション） |
| `lastPlayedAt` | Timestamp? | — | 最後に動画を開いた日時（マイリストのデフォルトソート用） |
| `hasNewArrival` | boolean | ✅ | 新着動画フラグ（Function Aで更新、ユーザーが確認で `false` に戻す） |
| `registeredAt` | Timestamp | ✅ | マイリストへの登録日時 |

---

### 3.12 `watch_progress`

ユーザーごと・動画ごとの視聴進捗。5秒ごとに更新される。

**パス**: `watch_progress/{progressId}`

> ドキュメントIDは `{userId}_{videoDocId}` 形式を使用する。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | ユーザーのuserId |
| `playlistId` | string | ✅ | 再生リストのドキュメントID（クエリ効率化のため） |
| `videoId` | string | ✅ | 動画のドキュメントID |
| `youtubeVideoId` | string | ✅ | YouTubeの動画ID |
| `watchedSeconds` | number | ✅ | 視聴した時間（秒）。5秒ごとに更新 |
| `progressPercent` | number | ✅ | 視聴進捗%（0〜100） |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

---

### 3.13 `watch_history`

ユーザーの動画視聴履歴。同一動画を複数回視聴した場合は上書き。

**パス**: `watch_history/{historyId}`

> ドキュメントIDは `{userId}_{videoDocId}` 形式を使用（重複防止のため上書き保存）。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | ユーザーのuserId |
| `videoId` | string | ✅ | 動画のドキュメントID |
| `youtubeVideoId` | string | ✅ | YouTubeの動画ID |
| `playlistId` | string | ✅ | 所属する再生リストのドキュメントID（クエリ用） |
| `videoTitle` | string | ✅ | 動画タイトル（denormalized） |
| `videoThumbnailUrl` | string | ✅ | 動画サムネイルURL（denormalized） |
| `playlistTitle` | string | ✅ | 再生リストタイトル（denormalized） |
| `progressPercent` | number | ✅ | 視聴進捗% |
| `watchedAt` | Timestamp | ✅ | 最後に視聴した日時 |

---

### 3.14 `collections`

ユーザーが作成したまとめ（複数再生リストのキュレーション）。

**パス**: `collections/{collectionId}`

> ドキュメントIDはFirestoreの自動採番ID。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | 作成者のuserId |
| `creatorName` | string | ✅ | 作成者の表示名（denormalized） |
| `title` | string | ✅ | まとめタイトル（最大50文字） |
| `description` | string? | — | まとめ説明文（最大500文字） |
| `visibility` | string | ✅ | 公開設定：`"public"` / `"unlisted"` / `"private"` |
| `showSpoilerComments` | boolean | ✅ | ネタバレコメントの表示設定（デフォルト：`false` = 折りたたみ） |
| `playlistIds` | string[] | ✅ | まとめに含まれる再生リストIDの順序リスト（最大10件） |
| `savedCount` | number | ✅ | 保存（ブックマーク）された回数（集計キャッシュ） |
| `createdAt` | Timestamp | ✅ | 作成日時 |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

> **サブコレクション**: `collections/{collectionId}/saves/{userId}` で保存ユーザーを管理する（重複保存防止）。

---

### 3.15 `workflows`

審査ワークフロー（提案・通報）の管理。

**パス**: `workflows/{workflowId}`

> ドキュメントIDはFirestoreの自動採番ID。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `workflowType` | string | ✅ | 種別：`"playlist_register"` / `"game_title_register"` / `"game_title_edit"` / `"playlist_report"` / `"review_report"` |
| `status` | string | ✅ | `"reviewing_lv1"`（AI/ジャンル運営側） / `"reviewing_lv2"`（オーナー） / `"approved"` / `"rejected"` |
| `submittedBy` | string | ✅ | 起票したユーザーのuserId |
| `genreId` | string? | — | 関連ジャンルID（STEP1審査者特定に使用）。未設定の場合はSTEP1スキップ |
| `step1AssignedOperatorIds` | string[] | ✅ | STEP1にアサインされた運営者のuserIdリスト |
| `proposalData` | map? | — | 提案内容（`playlist_register` / `game_title_register` / `game_title_edit` 時に使用） |
| `reportData` | map? | — | 通報内容（`playlist_report` / `review_report` 時に使用） |
| `step1History` | map[] | ✅ | STEP1の審査履歴（配列。AIと人間の審査を統合） |
| `step1Errors` | map[] | ✅ | AI審査エラー記録（配列） |
| `step2History` | map[] | ✅ | STEP2の審査履歴（配列） |
| `editHistory` | map[] | ✅ | 申請内容の編集履歴（配列） |
| `operatorMemo` | string? | — | 運営メモ（管理者間共有） |
| `submittedAt` | Timestamp | ✅ | 提出日時 |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

**`proposalData` の構造（`playlist_register` の場合）**

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `youtubePlaylistId` | string | YouTubeの再生リストID |
| `playlistTitle` | string | 再生リストタイトル |
| `channelId` | string | チャンネルID |
| `channelTitle` | string | チャンネル名 |
| `videoCount` | number | 動画数 |
| `videoTitles` | string[] | 動画タイトル一覧（最大50件） |
| `videoPublishedAts` | Timestamp[] | 各動画の公開日時 |
| `latestVideoPublishedAt` | Timestamp | 最終動画公開日時 |
| `selectedGameId` | string? | 提案者が選択したゲームタイトルID |

**`step1History` 要素の構造**

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `executedAt` | Timestamp | アクション日時 |
| `operatorId` | string | 審査者のuserId |
| `operatorName` | string | 審査者の表示名 |
| `isAI` | boolean | AI審査かどうか |
| `action` | string | `"approved"` / `"rejected"` |
| `result` | string? | AIの場合：`"ok"` / `"flag"` |
| `flags` | string[]? | AIの場合：フラグキー配列 |
| `comment` | string? | 判定コメント・却下理由 |

---

### 3.16 `notices`

管理者からユーザーへのお知らせ情報。

**パス**: `notices/{noticeId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `title` | string | ✅ | お知らせタイトル |
| `body` | string? | — | お知らせ本文（詳細モーダル用）。未設定の場合は「詳細を見る」リンク非表示 |
| `status` | string | ✅ | `"draft"` / `"scheduled"` / `"published"` / `"archived"` |
| `targetPages` | string[] | ✅ | 表示対象ページのパスリスト（例：`["*"]` = 全ページ） |
| `startAt` | Timestamp? | — | 掲載開始日時 |
| `endAt` | Timestamp? | — | 掲載終了日時 |
| `sendPushNotification` | boolean | ✅ | FCMプッシュ通知を送信するかどうか |
| `createdBy` | string | ✅ | 作成者のuserId |
| `createdAt` | Timestamp | ✅ | 作成日時 |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

---

### 3.17 `inquiries`

ユーザーからのお問い合わせ・チャットスレッド。

**パス**: `inquiries/{inquiryId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string? | — | 送信者のuserId（ゲストの場合はnull） |
| `userName` | string | ✅ | 送信者の表示名 |
| `email` | string | ✅ | 返信先メールアドレス |
| `category` | string | ✅ | お問い合わせカテゴリ |
| `subject` | string | ✅ | 件名 |
| `status` | string | ✅ | `"open"` / `"in_progress"` / `"resolved"` / `"closed"` |
| `isGuest` | boolean | ✅ | ゲスト送信フラグ |
| `operatorMemo` | string? | — | 対応メモ（管理者間共有） |
| `submittedAt` | Timestamp | ✅ | お問い合わせ送信日時 |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

**サブコレクション**: `inquiries/{inquiryId}/messages/{messageId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `senderId` | string? | — | 送信者のuserId（管理者側からの場合は管理者ID、ユーザー側はuserId） |
| `senderType` | string | ✅ | `"user"` / `"admin"` |
| `body` | string | ✅ | メッセージ本文 |
| `sentAt` | Timestamp | ✅ | 送信日時 |

---

### 3.18 `operation_logs`

管理画面における管理者の操作記録。閲覧専用（編集・削除不可）。

**パス**: `operation_logs/{logId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `operatorId` | string | ✅ | 操作を行った管理者のuserId |
| `operatorName` | string | ✅ | 管理者の表示名（denormalized） |
| `action` | string | ✅ | 操作種別（例：`"playlist_edit"` / `"user_ban"` / `"genre_create"`） |
| `targetId` | string? | — | 操作対象のドキュメントID |
| `targetName` | string? | — | 操作対象の表示名（denormalized） |
| `detail` | map? | — | 操作詳細（変更前後の値など。操作種別により異なる） |
| `executedAt` | Timestamp | ✅ | 操作日時 |

---

### 3.19 `admin_notifications`

システムが自動生成する管理者向け内部通知。

**パス**: `admin_notifications/{notificationId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `type` | string | ✅ | `"quota_exceeded"` / `"fraud_detected"` / `"review_lv2"` / `"collection_completed"` |
| `title` | string | ✅ | 通知タイトル |
| `body` | string | ✅ | 通知本文 |
| `relatedId` | string? | — | 関連ドキュメントID（workflow ID等） |
| `isRead` | boolean | ✅ | 既読フラグ（デフォルト：`false`） |
| `targetRole` | string | ✅ | 通知対象ロール：`"owner"` / `"all_admins"` |
| `createdAt` | Timestamp | ✅ | 生成日時 |

---

### 3.20 `fraud_alerts`

不正レビュー検知のアラート記録。

**パス**: `fraud_alerts/{alertId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | 異常と判定されたユーザーのuserId |
| `userName` | string | ✅ | ユーザー表示名（denormalized） |
| `detectedAt` | Timestamp | ✅ | 検知日時 |
| `reviewCountIn24h` | number | ✅ | 24時間以内の投稿数 |
| `status` | string | ✅ | `"pending"` / `"resolved"` |
| `resolvedAt` | Timestamp? | — | 対応完了日時 |
| `resolvedBy` | string? | — | 対応した管理者のuserId |

---

### 3.21 `batch_logs`

YouTube定期取得バッチ（Function A / B）の実行結果ログ。

**パス**: `batch_logs/{logId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `functionName` | string | ✅ | `"function_a"` / `"function_b"` |
| `executedAt` | Timestamp | ✅ | 実行開始日時 |
| `processedCount` | number | ✅ | 処理件数（再生リスト数またはチャンネル数） |
| `newVideoCount` | number? | — | 新規検出した動画数（Function Aのみ） |
| `status` | string | ✅ | `"success"` / `"skipped"` / `"error"` |
| `skipReason` | string? | — | スキップ理由（クォータ超過など） |
| `errorMessage` | string? | — | エラー内容 |
| `quotaConsumed` | number | ✅ | 消費クォータユニット数 |

---

### 3.22 `api_quota_logs`

Function A / B によるYouTube APIクォータ消費の記録。管理画面のモニタリング表示に使用。

**パス**: `api_quota_logs/{logId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `date` | string | ✅ | 日付（`YYYY-MM-DD` 形式） |
| `functionName` | string | ✅ | `"function_a"` / `"function_b"` |
| `quotaConsumed` | number | ✅ | 消費ユニット数 |
| `recordedAt` | Timestamp | ✅ | 記録日時 |

---

### 3.23 `collection_candidates`

AI運営者（Function C）が収集した再生リスト候補。オーナーのレビュー待ちキュー。

**パス**: `collection_candidates/{candidateId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `playlistId` | string | ✅ | YouTubeの再生リストID |
| `playlistTitle` | string | ✅ | 再生リストタイトル |
| `channelId` | string | ✅ | チャンネルID |
| `channelTitle` | string | ✅ | チャンネル名 |
| `thumbnailUrl` | string | ✅ | 再生リストサムネイルURL |
| `videoCount` | number | ✅ | 動画数 |
| `latestVideoPublishedAt` | Timestamp | ✅ | 最終動画公開日時 |
| `genreId` | string | ✅ | 担当ジャンルID |
| `genreName` | string | ✅ | 担当ジャンル名（denormalized） |
| `aiOperatorId` | string | ✅ | 収集したAI運営者のuserId |
| `aiResult` | string | ✅ | `"collect"` 固定（スクリーニング通過のみ保存） |
| `aiFlags` | string[] | ✅ | フラグキー配列 |
| `aiComment` | string | ✅ | AI判定コメント |
| `status` | string | ✅ | `"pending"` / `"approved"` / `"rejected"` / `"registered"` |
| `collectedAt` | Timestamp | ✅ | 収集日時 |
| `reviewedAt` | Timestamp? | — | オーナーレビュー日時 |
| `reviewedBy` | string? | — | レビューしたオーナーのuserId |
| `reviewComment` | string? | — | オーナーのコメント |

---

### 3.24 `collection_batch_logs`

Function C（AI運営者コンテンツ収集バッチ）の実行結果ログ。

**パス**: `collection_batch_logs/{logId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `executedAt` | Timestamp | ✅ | バッチ実行日時 |
| `processedGenres` | number | ✅ | 処理したジャンル数 |
| `searchCount` | number | ✅ | `search.list` の実行回数 |
| `candidatesFound` | number | ✅ | 収集候補として保存した件数 |
| `skippedByFilter` | number | ✅ | ハードフィルタで除外した件数 |
| `skippedBySpam` | number | ✅ | スパム判定で除外した件数 |
| `quotaConsumed` | number | ✅ | 消費クォータユニット数 |
| `status` | string | ✅ | `"success"` / `"partial"` / `"skipped"` / `"error"` |
| `message` | string? | — | スキップ・エラー時の詳細メッセージ |

---

### 3.25 `collection_quota_logs`

Function C によるAPIクォータ消費記録。既存の `api_quota_logs` とは分離管理。

**パス**: `collection_quota_logs/{logId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `date` | string | ✅ | 日付（`YYYY-MM-DD` 形式） |
| `quotaConsumed` | number | ✅ | 消費ユニット数（随時記録） |
| `recordedAt` | Timestamp | ✅ | 記録日時 |

---

### 3.26 `genre_search_keywords`

AI運営者がFunction Cで使用するジャンル別の検索キーワードリスト。

**パス**: `genre_search_keywords/{genreId}`

> ドキュメントIDは `genres` コレクションのジャンルIDと同一。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `genreId` | string | ✅ | ジャンルID（ドキュメントIDと同一） |
| `keywords` | string[] | ✅ | 検索キーワードリスト（例：`["RPG 実況", "ドラクエ 実況"]`） |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |
| `updatedBy` | string | ✅ | 最終更新者のuserId |

---

### 3.27 `ai_operators`

AIキャラクター（審査AI）の設定情報。`users` コレクションと対になる形で管理する。

**パス**: `ai_operators/{aiOperatorId}`

> ドキュメントIDは対応する `users` ドキュメントIDと同一（Firebase Auth UID）。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | 対応する `users` ドキュメントID |
| `displayName` | string | ✅ | AI審査キャラクター名（例：`"RPG審査AI"`） |
| `genreId` | string | ✅ | 担当するジャンルのID |
| `genreName` | string | ✅ | 担当ジャンル名（denormalized） |
| `isEnabled` | boolean | ✅ | 有効フラグ（無効化でAI審査をスキップ） |
| `createdAt` | Timestamp | ✅ | 生成日時（ジャンル作成時に自動生成） |

---

### 3.28 `ng_words`

レビューコメントへの入力を禁止するNGワードマスタ。

**パス**: `ng_words/{ngWordId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `word` | string | ✅ | NGワード |
| `createdBy` | string | ✅ | 登録したオーナーのuserId |
| `createdAt` | Timestamp | ✅ | 登録日時 |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

---

### 3.29 `app_settings`

アプリ全体で使用する設定値（閾値・フラグなど）を格納するコレクション。Cloud Functions からコード変更なしに調整できる設定はここで管理する。

**パス**: `app_settings/{settingId}`

> 基本的に少数の固定ドキュメントで構成する（例：`"fraud_detection"`）。

| フィールド例 | 型 | 説明（`fraud_detection` ドキュメントの場合） |
|------------|-----|------|
| `reviewCountThreshold24h` | number | 不正検知の24時間閾値（デフォルト：15） |

---

## 4. リレーション図

```
users (1) ──── (N) mylist ──── (N) playlists (1) ──── (N) videos
  │                                    │
  │                                    │
  │                              (N) reviews
  │                                    │
  │                                helpful_votes
  │
  ├── (N) watch_progress ──── (N) videos
  │
  ├── (N) watch_history ──── (N) videos
  │
  └── (N) collections (playlistIds[])


playlists ──── (1) channels
           ──── (1) games ──── (1) genres
                           └── (N) themes (themeIds[])

tags ←── playlists (playlistTagIds[])
     ←── games (gameTagIds[])

workflows ──── (1) users (submittedBy)
           ──── step1History[] → users (operatorId)

ai_operators ──── (1) users
             ──── (1) genres
```

---

## 5. インデックス設計

Firestoreは単一フィールドのインデックスは自動作成されるため、複合インデックスが必要なクエリのみ記載する。

### 5.1 フロント機能

| コレクション | インデックスフィールド | 用途 |
|------------|-------------------|------|
| `playlists` | `isPublic` (asc) + `score` (desc) | 再生リストをスコア順で取得 |
| `playlists` | `isPublic` (asc) + `registeredAt` (desc) | 新着順で取得 |
| `playlists` | `isPublic` (asc) + `gameGenreIds` (array-contains) + `score` (desc) | ジャンル絞り込み＋スコア順 |
| `playlists` | `isPublic` (asc) + `latestVideoPublishedAt` (desc) | 最新動画が新しい順 |
| `reviews` | `playlistId` (asc) + `postedAt` (desc) | 再生リスト別レビュー一覧 |
| `reviews` | `userId` (asc) + `postedAt` (desc) | ユーザー別レビュー履歴 |
| `mylist` | `userId` (asc) + `lastPlayedAt` (desc) | マイリスト（最後に再生順） |
| `mylist` | `userId` (asc) + `registeredAt` (desc) | マイリスト（登録日順） |
| `watch_history` | `userId` (asc) + `watchedAt` (desc) | 視聴履歴（日時降順） |
| `collections` | `userId` (asc) + `createdAt` (desc) | ユーザー別まとめ一覧 |
| `collections` | `visibility` (asc) + `savedCount` (desc) | 公開まとめ（保存数順） |
| `collections` | `visibility` (asc) + `createdAt` (desc) | 公開まとめ（新着順） |

### 5.2 管理機能・バッチ

| コレクション | インデックスフィールド | 用途 |
|------------|-------------------|------|
| `workflows` | `status` (asc) + `submittedAt` (desc) | ワークフロー一覧 |
| `workflows` | `genreId` (asc) + `status` (asc) | ジャンル別ワークフロー |
| `fraud_alerts` | `status` (asc) + `detectedAt` (desc) | 未対応アラート一覧 |
| `batch_logs` | `functionName` (asc) + `executedAt` (desc) | バッチ実行履歴 |
| `api_quota_logs` | `date` (asc) + `functionName` (asc) | 日別クォータ集計 |
| `collection_candidates` | `status` (asc) + `collectedAt` (desc) | 候補一覧 |

---

## 6. セキュリティルール方針

### 6.1 基本方針

| 操作 | 方針 |
|------|------|
| ゲストの読み取り | `playlists`（`isPublic: true`）・`videos`・`channels`・`games`・`genres`・`themes`・`tags`・`reviews`・`collections`（`visibility: "public"` / `"unlisted"`）のみ許可 |
| 認証済みユーザーの書き込み | 自分のUID紐づきドキュメントのみ書き込み可（`mylist`・`reviews`・`watch_progress`・`watch_history`・`collections`） |
| 管理者専用コレクション | Firebase Custom Claimsの `role` フィールドで `"owner"` / `"operator"` を判定 |
| カウンターの直接更新 | ユーザーによる直接書き込みは禁止。Cloud Functions経由でのみ更新（`playlists.mylistCount`・`reviews.helpfulCount` 等） |
| `operation_logs` | 管理者からも書き込み・削除不可。Cloud Functionsのみ書き込み可 |

### 6.2 コレクション別アクセス制御概要

| コレクション | ゲスト | 一般ユーザー | 運営者 | オーナー |
|------------|:---:|:---:|:---:|:---:|
| `users`（自分のみ） | R | RW | R（全件） | RW（全件） |
| `playlists` | R（公開） | R（公開） | RW（担当ジャンル） | RW（全件） |
| `videos` | R | R | R | RW |
| `channels` | R | R | RW（担当） | RW（全件） |
| `games` | R | R | RW（担当ジャンル） | RW（全件） |
| `genres` / `themes` | R | R | R | RW |
| `tags` | R | R（付与は可） | RW | RW |
| `reviews` | R | RW（自分のみ） | R | RW |
| `mylist` | — | RW（自分のみ） | — | R |
| `collections` | R（公開） | RW（自分のみ） | — | R |
| `workflows` | — | W（新規作成のみ） | RW（担当分） | RW（全件） |
| `notices` | R（掲載中） | R（掲載中） | RW | RW |
| `inquiries` | W（新規） | RW（自分のみ） | RW | RW |
| `operation_logs` | — | — | R | R |
| `admin_notifications` | — | — | R（全員向け） | RW |
| `fraud_alerts` | — | — | R | RW |
| `batch_logs` | — | — | R | R |
| `api_quota_logs` | — | — | R | R |
| `collection_candidates` | — | — | — | RW |
| `ng_words` | R | R | R | RW |
| `app_settings` | — | — | — | RW |

> R = 読み取り可、W = 書き込み可（新規作成）、RW = 読み書き可、— = 不可

---

## 7. データ整合性・削除ポリシー

### 7.1 退会・強制退会時の削除

| 削除対象コレクション | 削除方式 |
|-------------------|---------|
| `users/{userId}` | 物理削除 |
| `reviews` (`userId` 一致) | 物理削除 |
| `mylist` (`userId` 一致) | 物理削除 |
| `watch_history` (`userId` 一致) | 物理削除 |
| `watch_progress` (`userId` 一致) | 物理削除 |
| `helpful_votes` (`userId` 一致) | 物理削除（対象レビューの `helpfulCount` も**減算する**） |
| `collections` (`userId` 一致) | 物理削除 |

> **補足**: 退会・強制退会いずれの場合も、そのユーザーが押した「参考になった」は削除し、対象レビューの `helpfulCount` をデクリメントする。アカウントが消えた時点で投票も消えるという一貫した方針。削除はCloud Functions（退会処理トリガー）でバッチ処理する。

### 7.2 マスタ削除時の整合性

| 削除対象 | 削除方式 | 紐づくデータの扱い |
|---------|---------|----------------|
| `playlists` | 論理削除（`isPublic: false`） | `reviews` / `mylist` / `watch_history` は保持 |
| `games` | 物理削除 | `playlists` は残る。`playlists.gameId` をnullにする |
| `channels` | 物理削除 | `playlists` は残る。`playlists.channelId` のみ紐づき解除 |
| `genres` | 物理削除 | `games.genreId` を外す。対応AIキャラクターは保持 |
| `themes` | 物理削除 | `games.themeIds[]` から外す |
| `tags`（ユーザータグ） | 物理削除 | `playlists.playlistTagIds[]` / `games.gameTagIds[]` から外す |
| `tags`（運営者タグ） | 削除不可 | — |

### 7.3 カウンターフィールドの更新タイミング

| フィールド | 更新トリガー |
|-----------|------------|
| `playlists.mylistCount` | `mylist` ドキュメントの作成・削除時（Firestoreトリガー） |
| `playlists.reviewCount` | `reviews` ドキュメントの作成・削除時（Firestoreトリガー） |
| `playlists.score` | `reviews` ドキュメントの作成・更新・削除時（Firestoreトリガー） |
| `reviews.helpfulCount` | `helpful_votes` ドキュメントの作成・削除時（Firestoreトリガー） |
| `users.reviewCount` | `reviews` ドキュメントの作成・削除時（Firestoreトリガー） |
| `users.helpfulReceivedCount` | `reviews.helpfulCount` の更新時（Firestoreトリガー） |
| `channels.playlistCount` | `playlists` の登録・論理削除時 |
| `games.playlistCount` | `playlists` の登録・論理削除・ゲーム紐づき変更時 |
| `genres.gameTitleCount` | `games` のジャンル紐づき変更時 |
| `tags.usagePlaylistCount` | `playlists.playlistTagIds[]` 更新時 |
| `tags.usageGameCount` | `games.gameTagIds[]` 更新時 |
| `videos.playStartCount` | 再生ボタン押下時（クライアントまたはCloud Functions） |

---

## 8. 改訂履歴

| バージョン | 日付 | 内容 |
|-----------|------|------|
| v1.0 | 2026-03-20 | 初版作成。全仕様書を横断してFirestoreコレクション・フィールドを定義 |
| v1.1 | 2026-03-20 | `weekly_ranking_snapshots` コレクションを削除。退会・強制退会時の `helpfulCount` 処理を「減算する」に統一（案1採用） |