# プレミテ Firestore データモデル設計書

**バージョン**: v1.4  
**作成日**: 2026年3月30日  
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
| 21 | `batch_logs` | YouTube定期取得バッチ実行ログ（動画更新バッチ / チャンネル更新バッチ） | YouTube定期取得仕様書 |
| 22 | `api_quota_logs` | YouTube APIクォータ消費ログ（動画更新バッチ / チャンネル更新バッチ） | モニタリング仕様書 |
| 23 | `collection_candidates` | AI運営者が収集した再生リスト候補 | AI運営者コンテンツ収集仕様書 |
| 24 | `collection_batch_logs` | コンテンツ収集バッチ実行ログ（コンテンツ収集バッチ） | AI運営者コンテンツ収集仕様書 |
| 25 | `collection_quota_logs` | コンテンツ収集APIクォータ消費ログ | AI運営者コンテンツ収集仕様書 |
| 26 | `genre_search_keywords` | AI運営者が使用するジャンル別検索キーワード | AI運営者コンテンツ収集仕様書 |
| 27 | `ai_operators` | AI運営者の設定情報 | ユーザー管理仕様書 / AI運営者審査仕様書 |
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

一般ユーザー・管理者・AI運営者すべてのアカウント情報を統合して管理する。ドキュメントIDはFirebase AuthenticationのUID。

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
> - AI運営者のアカウントも `isAI: true` として同コレクションで管理。詳細設定は `ai_operators` コレクションに持つ。

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
| `lastFetchedAt` | Timestamp? | — | 動画更新バッチによる最終更新日時 |

---

### 3.3 `videos`

各再生リストに属する動画の情報。

**パス**: `videos/{videoId}`

> ドキュメントIDは YouTube 動画ID（`dQw4w9WgXcQ` 形式）と再生リストIDを組み合わせた `{playlistId}_{youtubeVideoId}` 形式とする。

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
| `subscriberCount` | number? | — | 登録者数（チャンネル更新バッチで週次更新） |
| `playlistCount` | number | ✅ | プレミテに登録された再生リスト数（集計キャッシュ） |
| `registeredAt` | Timestamp | ✅ | プレミテへの登録日時 |
| `lastFetchedAt` | Timestamp? | — | チャンネル更新バッチによる最終更新日時 |

---

### 3.5 `games`

ゲームタイトルマスタ。楽天ブックスAPIから取得した情報をベースに管理。

**パス**: `games/{gameId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `rakutenItemCode` | string? | — | 楽天ブックスのitemCode（ASIN相当） |
| `rakutenItemName` | string? | — | 楽天ブックスの元の商品名 |
| `title` | string | ✅ | ゲームタイトル名（正規化後または選択された名称） |
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

> **設計注記**: AI運営者はプラットフォーム全体で1名固定（`プレミテ審査AI`）であり、ジャンル追加時の自動生成は行わない。

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

---

### 3.10 `helpful_votes`

「参考になった」ボタンの押下記録。1ユーザー×1レビューで1件。

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
| `playlistId` | string | ✅ | 再生リストのドキュメントID |
| `createdAt` | Timestamp | ✅ | 登録日時 |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

---

### 3.12 `watch_progress`

動画ごとの視聴進捗。続きから再生するための位置情報を管理。

**パス**: `watch_progress/{progressId}`

> ドキュメントIDは `{userId}_{playlistId}_{youtubeVideoId}` 形式。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | ユーザーのuserId |
| `playlistId` | string | ✅ | 再生リストのドキュメントID |
| `youtubeVideoId` | string | ✅ | YouTube動画ID |
| `lastPlayedSeconds` | number | ✅ | 最後に停止した位置（秒） |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

---

### 3.13 `watch_history`

ユーザーの視聴履歴。カード表示用の最新情報のキャッシュ。

**パス**: `watch_history/{historyId}`

> ドキュメントIDは `{userId}_{youtubeVideoId}` 形式。重複エントリを許容せず、最新時刻で上書きする。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | ユーザーのuserId |
| `playlistId` | string | ✅ | 再生リストのドキュメントID |
| `youtubeVideoId` | string | ✅ | YouTube動画ID |
| `progressPercent` | number | ✅ | 視聴進捗率（0-100） |
| `watchedAt` | Timestamp | ✅ | 視聴日時（最新） |

---

### 3.14 `collections`

ユーザーが作成した「まとめ」情報。

**パス**: `collections/{collectionId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | 作成者のuserId |
| `title` | string | ✅ | まとめタイトル |
| `description` | string? | — | まとめ説明文 |
| `visibility` | string | ✅ | `"public"` / `"unlisted"` / `"private"` |
| `playlistIds` | string[] | ✅ | まとめられた再生リストIDリスト（最大10件） |
| `showSpoiler` | boolean | ✅ | ネタバレコメントを表示するか |
| `savedCount` | number | ✅ | 保存された数 |
| `createdAt` | Timestamp | ✅ | 作成日時 |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

---

### 3.15 `workflows`

審査ワークフロー（提案・通報）の記録。

**パス**: `workflows/{workflowId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `type` | string | ✅ | `"playlist_register"` / `"game_title_register"` / `"game_title_edit"` / `"playlist_report"` / `"review_report"` |
| `status` | string | ✅ | `"reviewing_lv1"` / `"reviewing_lv2"` / `"approved"` / `"rejected"` |
| `submittedBy` | string | ✅ | 起票したユーザーのuserId |
| `genreId` | string? | — | 関連ジャンルID（STEP1審査者特定に使用） |
| `step1AssignedOperatorIds` | string[] | ✅ | STEP1にアサインされた運営者のuserIdリスト |
| `proposalData` | map? | — | 提案データ（種別により異なる） |
| `reportData` | map? | — | 通報データ（種別により異なる） |
| `step1History` | map[] | ✅ | STEP1の審査履歴（配列） |
| `step1Errors` | map[] | ✅ | AI審査エラー記録（配列） |
| `step2History` | map[] | ✅ | STEP2の審査履歴（配列） |
| `editHistory` | map[] | ✅ | 申請内容の編集履歴（配列） |
| `operatorMemo` | string? | — | 運営メモ |
| `submittedAt` | Timestamp | ✅ | 提出日時 |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

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
| `comment` | string? | 判定コメント |

---

### 3.16 `notices`

管理者からユーザーへのお知らせ情報。

**パス**: `notices/{noticeId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `title` | string | ✅ | お知らせタイトル |
| `body` | string? | — | お知らせ本文 |
| `status` | string | ✅ | `"draft"` / `"scheduled"` / `"published"` / `"archived"` |
| `targetPages` | string[] | ✅ | 表示対象ページのパスリスト |
| `startAt` | Timestamp? | — | 掲載開始日時 |
| `endAt` | Timestamp? | — | 掲載終了日時 |
| `sendPushNotification` | boolean | ✅ | プッシュ通知送信フラグ |
| `createdBy` | string | ✅ | 作成者のuserId |
| `createdAt` | Timestamp | ✅ | 作成日時 |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

---

### 3.17 `inquiries`

ユーザーからのお問い合わせ・チャットスレッド。

**パス**: `inquiries/{inquiryId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string? | — | 送信者のuserId（ゲストはnull） |
| `userName` | string | ✅ | 送信者の表示名 |
| `email` | string | ✅ | 返信先メールアドレス |
| `category` | string | ✅ | お問い合わせカテゴリ |
| `subject` | string | ✅ | 件名 |
| `status` | string | ✅ | `"open"` / `"in_progress"` / `"resolved"` / `"closed"` |
| `isGuest` | boolean | ✅ | ゲスト送信フラグ |
| `operatorMemo` | string? | — | 対応メモ |
| `submittedAt` | Timestamp | ✅ | お問い合わせ送信日時 |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

**サブコレクション**: `inquiries/{inquiryId}/messages/{messageId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `senderId` | string? | — | 送信者ID |
| `senderType` | string | ✅ | `"user"` / `"admin"` |
| `body` | string | ✅ | メッセージ本文 |
| `sentAt` | Timestamp | ✅ | 送信日時 |

---

### 3.18 `operation_logs`

管理画面における管理者の操作記録。

**パス**: `operation_logs/{logId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `operatorId` | string | ✅ | 管理者のuserId |
| `operatorName` | string | ✅ | 管理者の表示名 |
| `action` | string | ✅ | 操作種別 |
| `targetId` | string? | — | 操作対象ID |
| `targetName` | string? | — | 操作対象名 |
| `detail` | map? | — | 操作詳細 |
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
| `relatedId` | string? | — | 関連ドキュメントID |
| `isRead` | boolean | ✅ | 既読フラグ |
| `targetRole` | string | ✅ | 対象ロール：`"owner"` / `"all_admins"` |
| `createdAt` | Timestamp | ✅ | 生成日時 |

---

### 3.20 `fraud_alerts`

不正レビュー検知のアラート記録。

**パス**: `fraud_alerts/{alertId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | 対象ユーザーのuserId |
| `userName` | string | ✅ | ユーザー名 |
| `detectedAt` | Timestamp | ✅ | 検知日時 |
| `reviewCountIn24h` | number | ✅ | 24時間以内の投稿数 |
| `status` | string | ✅ | `"pending"` / `"resolved"` |
| `resolvedBy` | string? | — | 対応した管理者のuserId |
| `resolvedAt` | Timestamp? | — | 対応完了日時 |

---

### 3.21 `batch_logs`

YouTube定期取得バッチの実行結果ログ。

**パス**: `batch_logs/{logId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `functionName` | string | ✅ | `"video_update"` / `"channel_update"` |
| `executedAt` | Timestamp | ✅ | 実行開始日時 |
| `processedCount` | number | ✅ | 処理件数 |
| `newVideoCount` | number? | — | 新規検出動画数 |
| `status` | string | ✅ | `"success"` / `"skipped"` / `"error"` |
| `skipReason` | string? | — | スキップ理由 |
| `errorMessage` | string? | — | エラー内容 |
| `quotaConsumed` | number | ✅ | 消費クォータ |

---

### 3.22 `api_quota_logs`

YouTube API クォータ消費の記録。

**パス**: `api_quota_logs/{logId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `date` | string | ✅ | 日付（`YYYY-MM-DD`） |
| `functionName` | string | ✅ | `"video_update"` / `"channel_update"` |
| `quotaConsumed` | number | ✅ | 消費ユニット数 |
| `recordedAt` | Timestamp | ✅ | 記録日時 |

---

### 3.23 `collection_candidates`

AI運営者が収集した再生リスト候補。

**パス**: `collection_candidates/{candidateId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `playlistId` | string | ✅ | YouTubeの再生リストID |
| `playlistTitle` | string | ✅ | 再生リストタイトル |
| `channelId` | string | ✅ | チャンネルID |
| `channelTitle` | string | ✅ | チャンネル名 |
| `thumbnailUrl` | string | ✅ | サムネイルURL |
| `videoCount` | number | ✅ | 動画数 |
| `latestVideoPublishedAt` | Timestamp | ✅ | 最終動画公開日時 |
| `genreId` | string | ✅ | 収集のトリガーとなったジャンルID（発見時のコンテキスト） |
| `genreName` | string | ✅ | 収集のトリガーとなったジャンル名（denormalized） |
| `aiOperatorId` | string | ✅ | 収集したAI運営者のuserId（プラットフォーム全体共通AI） |
| `aiResult` | string | ✅ | `"collect"` 固定 |
| `aiFlags` | string[] | ✅ | フラグキー配列 |
| `aiComment` | string | ✅ | AI判定コメント |
| `status` | string | ✅ | `"pending"` / `"approved"` / `"rejected"` / `"registered"` |
| `collectedAt` | Timestamp | ✅ | 収集日時 |
| `reviewedAt` | Timestamp? | — | オーナーレビュー日時 |
| `reviewedBy` | string? | — | レビューしたオーナーのuserId |
| `reviewComment` | string? | — | オーナーのコメント |

---

### 3.24 `collection_batch_logs`

コンテンツ収集バッチの実行結果ログ。

**パス**: `collection_batch_logs/{logId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `executedAt` | Timestamp | ✅ | バッチ実行日時 |
| `processedGenres` | number | ✅ | 処理ジャンル数 |
| `searchCount` | number | ✅ | 検索API実行回数 |
| `candidatesFound` | number | ✅ | 収集候補数 |
| `skippedByFilter` | number | ✅ | フィルタ除外数 |
| `skippedBySpam` | number | ✅ | スパム除外数 |
| `status` | string | ✅ | `"success"` / `"partial"` / `"skipped"` / `"error"` |
| `quotaConsumed` | number | ✅ | 消費クォータ |

---

### 3.25 `collection_quota_logs`

コンテンツ収集バッチによるクォータ消費記録。

**パス**: `collection_quota_logs/{logId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `date` | string | ✅ | 日付（`YYYY-MM-DD`） |
| `quotaConsumed` | number | ✅ | 消費ユニット数 |
| `recordedAt` | Timestamp | ✅ | 記録日時 |

---

### 3.26 `genre_search_keywords`

コンテンツ収集で使用するジャンル別検索キーワード。

**パス**: `genre_search_keywords/{genreId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `genreId` | string | ✅ | ジャンルID |
| `keywords` | string[] | ✅ | 検索キーワードリスト |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |
| `updatedBy` | string | ✅ | 最終更新者のuserId |

---

### 3.27 `ai_operators`

AI運営者（審査AI）の設定。プラットフォーム共通で1体のみ定義。

**パス**: `ai_operators/{aiOperatorId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | 対応する `users` ドキュメントID |
| `displayName` | string | ✅ | AI運営者表示名（例：`"プレミテ審査AI"`） |
| `isEnabled` | boolean | ✅ | 有効フラグ |
| `createdAt` | Timestamp | ✅ | 生成日時 |

---

### 3.28 `ng_words`

レビューコメント等の入力禁止ワード。

**パス**: `ng_words/{ngWordId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `word` | string | ✅ | NGワード |
| `createdBy` | string | ✅ | 登録者のuserId |
| `createdAt` | Timestamp | ✅ | 登録日時 |

---

### 3.29 `app_settings`

アプリ全体の設定値マスタ。

**パス**: `app_settings/{settingId}`

| フィールド例 | 型 | 説明 |
|------------|-----|------|
| `fraudThreshold` | number | 不正検知閾値 |

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
```

---

## 5. インデックス設計

### 5.1 フロント機能

| コレクション | インデックスフィールド | 用途 |
|------------|-------------------|------|
| `playlists` | `isPublic` (asc) + `score` (desc) | 評価順取得 |
| `playlists` | `isPublic` (asc) + `registeredAt` (desc) | 新着順取得 |
| `playlists` | `isPublic` (asc) + `gameGenreIds` (array-contains) + `score` (desc) | ジャンル別評価順 |
| `reviews` | `playlistId` (asc) + `postedAt` (desc) | プレイリスト別レビュー |
| `watch_history` | `userId` (asc) + `watchedAt` (desc) | ユーザー別視聴履歴 |

### 5.2 管理機能

| コレクション | インデックスフィールド | 用途 |
|------------|-------------------|------|
| `workflows` | `status` (asc) + `submittedAt` (desc) | ステータス別ワークフロー |
| `collection_candidates` | `status` (asc) + `collectedAt` (desc) | ステータス別候補一覧 |

---

## 6. セキュリティルール方針

- **一般公開**: `playlists` (isPublic=true), `games`, `genres`, `tags`, `reviews` はゲストR可。
- **個人データ**: `mylist`, `watch_progress`, `watch_history`, `collections` は自分のみRW可。
- **管理データ**: `workflows`, `ai_operators`, `app_settings` は管理者のみRW可。
- **不変ログ**: `operation_logs` はシステムのみW、管理者はRのみ。

---

## 7. データ整合性・削除ポリシー

### 7.1 退会時の物理削除
- `users`, `reviews`, `mylist`, `watch_history`, `watch_progress`, `helpful_votes`, `collections` を物理削除。

### 7.2 マスタ削除時の影響
- `genres` 物理削除時: `games.genreId` を null 化。AI運営者への影響なし。
- `games` 物理削除時: `playlists.gameId` を null 化。

---

## 8. 改訂履歴

| バージョン | 日付 | 内容 |
|-----------|------|------|
| v1.0 | 2026-03-20 | 初版作成 |
| v1.1 | 2026-03-20 | weekly_ranking_snapshots コレクションを削除 |
| v1.2 | 2026-03-24 | バッチ名称の統一（video_update/channel_update） |
| v1.3 | 2026-03-24 | games コレクションに rakutenItemName フィールドを追加 |
| v1.4 | 2026-03-30 | AI運営者の1体統合に伴う定義更新。ai_operators のジャンルフィールド削除。collection_candidates のジャンルフィールドをコンテキストとして再定義。破損ドキュメントの復旧。 |
