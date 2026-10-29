# プレミテ Firestore データモデル設計書

**バージョン**: v1.26  
**作成日**: 2026年3月30日（更新）  
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
     - 3.14.1 [saved_collections](#3141-saved_collections)
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
   - 3.26 [ai_operators](#326-ai_operators)
   - 3.27 [ng_words](#327-ng_words)
   - 3.28 [app_settings](#328-app_settings)
   - 3.29 [new_title_candidates](#329-new_title_candidates)
   - 3.30 [notifications](#330-notifications)
   - 3.31 [inquiry_upload_counters](#331-inquiry_upload_counters)
   - 3.32 [exploration_channels](#332-exploration_channels)
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
| 14-1 | `saved_collections` | まとめの保存記録（他人のまとめを保存） | まとめ機能仕様書 §8 |
| 15 | `workflows` | 審査ワークフロー（提案・通報） | 審査ワークフロー仕様書 |
| 16 | `notices` | お知らせ（管理者→ユーザー向け） | お知らせ管理仕様書 |
| 17 | `inquiries` | お問い合わせ・チャットスレッド | お問い合わせ管理仕様書 |
| 18 | `operation_logs` | 管理画面操作ログ | 操作ログ仕様書 |
| 19 | `admin_notifications` | 管理者向け内部通知 | モニタリング仕様書 / AI運営者審査仕様書 |
| 20 | `fraud_alerts` | 不正レビュー検知アラート | モニタリング・不正監視仕様書 |
| 21 | `batch_logs` | YouTube定期取得バッチ実行ログ（動画更新バッチ / チャンネル更新バッチ） | YouTube定期取得仕様書 |
| 22 | `api_quota_logs` | YouTube APIクォータ消費ログ（動画更新バッチ / チャンネル更新バッチ） | モニタリング仕様書 |
| 23 | `collection_candidates` | コンテンツ収集（チャンネル起点の探索）で集めた再生リスト候補 | AI運営者コンテンツ収集仕様書 / 収集候補レビューUI仕様書 |
| 24 | `collection_batch_logs` | コンテンツ収集バッチ実行ログ（コンテンツ収集バッチ） | AI運営者コンテンツ収集仕様書 |
| 25 | `collection_quota_logs` | コンテンツ収集APIクォータ消費ログ | AI運営者コンテンツ収集仕様書 |
| 26 | `ai_operators` | AI運営者の設定情報 | ユーザー管理仕様書 / AI運営者審査仕様書 |
| 27 | `ng_words` | NGワードマスタ | マスタ管理仕様書 |
| 28 | `app_settings` | アプリ全体の設定値（閾値など） | モニタリング仕様書 |
| 29 | `new_title_candidates` | 新作タイトル検知候補 | AI運営者 コンテンツ収集仕様書 |
| 30 | `notifications` | ユーザー向けサイト内通知（ベルアイコン・通知一覧） | ユーザー通知機能仕様書 |
| 31 | `exploration_channels` | コンテンツ収集の探索対象チャンネル | AI運営者コンテンツ収集仕様書 §3.1 |

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
| `isMylistPublic` | boolean | ✅ | マイリストの公開設定（デフォルト：`true`。`init-user` で作成。未設定の古いアカウントも公開扱い。設定ページ「プライバシー設定」で変更） |
| `isReviewHistoryPublic` | boolean | ✅ | レビュー履歴の公開設定（デフォルト：`true`。同上） |
| `showNewArrivalNotification` | boolean | ✅ | マイリストの新着通知表示設定（デフォルト：`true`） |
| `isContinuousPlayEnabled` | boolean | ✅ | 連続再生設定（ユーザー全体共通、デフォルト：`true`）。動画プレーヤー仕様書「連続再生機能」参照 |
| `hideUpcomingThumbnails` | boolean | — | 再生リスト詳細の動画リストで、到達済みより先の話のサムネイルを隠す設定（未設定は `false` 扱い）。動画プレーヤー仕様書「先の話のサムネイルを隠す（ユーザー設定）」参照 |
| `hideSpoilerReviews` | boolean | ✅ | レビュー一覧のネタバレ非表示フィルター設定（デフォルト：`true`）。レビュー投稿機能仕様書「ネタバレフィルター」節（ログイン済みユーザーの端末をまたいだ保存先。未ログイン時はLocalStorage） |
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
| `proposedBy` | string? | — | 一般ユーザーの提案を承認して登録した場合の提案者のuserId（管理者の直接登録は null。v1.22） |
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
| `aliases` | string[]? | — | 別名（略称・表記ゆれ。例：「スマブラ」）。ゲームタイトル選択モーダルの検索対象（v1.23、ページ 再生リストを追加する 仕様書 §9.2）。管理者がマスタで登録 |
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

> ドキュメントIDは `mylist`/`watch_progress` 等と同じ `{userId}_{playlistId}` 形式とする（1ユーザー×1再生リストで1件の制約をID自体で保証する）。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | 投稿者のuserId |
| `playlistId` | string | ✅ | 対象再生リストのドキュメントID |
| `starRating` | number? | — | 星評価（0.5〜5.0、0.5刻み）。未設定の場合はnull |
| `watchStatus` | string? | — | 視聴ステータス：`"want_to_watch"` / `"watching"` / `"completed"` / `"on_hold"` / `"dropped"`。`mylist.watchStatus`（3.11節）の非正規化コピー（正はmylist側）。表示（レビュー一覧）専用で、書き込みは app/api/reviews/upsert 経由で両方に同時反映する。マイリストページからの削除（app/api/mylist の DELETE）でも `null` に解除する（星評価・コメントが無ければレビューごと削除） |
| `comment` | string? | — | レビューコメント（任意） |
| `hasSpoiler` | boolean | ✅ | ネタバレフラグ（デフォルト：`false`） |
| `helpfulCount` | number | ✅ | 「参考になった」獲得数（変数H、デフォルト：0） |
| `trustScore` | number? | — | 信頼度スコア（変数W、バッチまたはリアルタイムで算出） |
| `watchDepth` | number? | — | 視聴深度（変数D、0.0〜1.0）。`watchStatus` が `"completed"` の場合は1.0固定 |
| `lastOpenedEpisode` | number? | — | 最後に開いた話数（`watch_progress` からの参照値） |
| `genreExpertiseScore` | number? | — | ジャンル専門性スコア（変数G、算出時点のスナップショット） |
| `commentScore` | number? | — | コメント有無による乗数（変数C。あり: `1.0` / なし: `0.5`。共通 信頼度スコアリングシステム仕様書 §3.3に準拠） |
| `userDisplayName` | string | ✅ | 投稿者の表示名の非正規化コピー（投稿・更新時点のスナップショット）。`users`は本人・管理者以外読めないルールのため、レビュー一覧での表示にはこちらを参照する（HANDOFF.md未解決事項1の対応）。プロフィールで表示名を変更すると `PATCH /api/users/[userId]/profile` が本人の全レビュー分を新しい名前に揃える |
| `userProfileImageUrl` | string? | — | 投稿者のプロフィール画像URLの非正規化コピー（同上） |
| `isHidden` | boolean? | — | 通報承認による非表示（論理削除）フラグ。`true` のレビューは一覧・集計・スコアから除外する（管理 審査ワークフロー仕様書 §3.1）。未設定は `false` 扱い。書き込みは Admin SDK のみ（本人のクライアント更新の許可フィールドに含めない） |
| `hiddenAt` | Timestamp? | — | 非表示にした日時 |
| `hiddenByWorkflowId` | string? | — | 非表示の根拠となった `workflows` のドキュメントID |
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
| `watchStatus` | string | ✅ | 視聴ステータス：`"want_to_watch"` / `"watching"` / `"completed"` / `"on_hold"` / `"dropped"`（デフォルト：`"want_to_watch"`） |
| `isReverseOrder` | boolean | ✅ | 逆順トグル（デフォルト：`false`）。動画プレーヤーページの逆順トグルと設定を共有する |
| `createdAt` | Timestamp | ✅ | 登録日時 |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

> **設計注記**: `watchStatus`はこちら（`mylist`）が正であり、`reviews.watchStatus`（3.9節）はレビュー一覧での表示用にこのフィールドをそのままコピーした非正規化フィールドとする。書き込みは常に app/api/reviews/upsert 経由で両方を同時に更新するため、原則ズレは発生しない。マイリストページからの削除（app/api/mylist の DELETE、ページ マイリスト機能仕様書 §5.9）も `reviews.watchStatus` を同時に解除する。ただしマイリストページ・マイリストカードからのステータス直接変更（クライアントSDKで`mylist`のみ更新）経路もあり、そちらは`reviews.watchStatus`へ即時反映されない（次回そのレビューを更新するまで古いままになりうる。`userDisplayName`等、他の非正規化フィールドと同じ許容範囲の設計）。
> 旧仕様（レビュー投稿機能仕様書 v1.3.0以前）では`reviews.watchStatus`のみ`"reviewing"`という値を持ち得たが、`mylist`側に対応する概念が無く不整合だったため廃止した（v1.4.0で「完走」に統合）。既存データに残る`"reviewing"`はアプリ側で読み取り時に`"completed"`へ丸めて扱う（`components/ui/Chip.tsx`の`normalizeWatchStatus`）。

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
| `userDisplayName` | string | ✅ | 作成者の表示名（作成時・フォーム保存時点のスナップショット。`reviews.userDisplayName` と同じ非正規化コピー。再生リストの追加・解除や並び替えでは更新しない。プロフィールで表示名を変更したときは `reviews.userDisplayName` と同時に揃える） |
| `userProfileImageUrl` | string? | — | 作成者のプロフィール画像URL（同上） |
| `title` | string | ✅ | まとめタイトル |
| `description` | string? | — | まとめ説明文 |
| `visibility` | string | ✅ | `"public"` / `"unlisted"` / `"private"` |
| `playlistIds` | string[] | ✅ | まとめられた再生リストIDリスト（最大10件） |
| `showSpoiler` | boolean | ✅ | ネタバレコメントを表示するか |
| `savedCount` | number | ✅ | 保存された数 |
| `sortOrder` | number | ✅ | 作成者の「自分のまとめ」での表示順（昇順）。新規作成時は既存の最小値−1（先頭）、並び替え時に0,1,2…で振り直す（まとめ機能仕様書 §4.5） |
| `createdAt` | Timestamp | ✅ | 作成日時 |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

> **書き込み経路**: 作成・編集・削除・並び替えはすべて `app/api/collections` 配下の API Route（Admin SDK）経由。
> 1ユーザー10件の上限と作成者名の非正規化コピーをクライアントに偽装させないため、`firestore.rules` はクライアントからの書き込みを禁止している。

### 3.14.1 `saved_collections`

ユーザーが他人のまとめを保存した記録（まとめ機能仕様書 §8）。2026-10-12 追加（フェーズ6ステップ4-3）。

**パス**: `saved_collections/{userId}_{collectionId}`（mylist・reviews と同じ形式）

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | 保存したユーザーのuserId |
| `collectionId` | string | ✅ | 保存したまとめのID |
| `collectionTitle` | string | ✅ | 保存時点のまとめタイトル（まとめが非公開化され読めなくなった場合の案内に使う） |
| `savedAt` | Timestamp | ✅ | 保存日時（保存したまとめ一覧は降順） |

> **書き込み経路**: 保存・解除は `app/api/collections/[collectionId]/save`（Admin SDK）のみで、`collections.savedCount` の増減と同じトランザクションで行う。
> 保存したまとめ一覧の取得も `app/api/collections/saved` 経由（非公開化されたまとめを「閲覧できなくなったまとめ」として返すため）。
> まとめを削除すると、そのまとめの保存記録はすべて同時に削除される（まとめ本体と1バッチで削除するため、保存数が約500を超える規模になったら分割が必要）。公開・限定公開の他人のまとめのみ保存できる。

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
| `proposalData` | map? | — | 提案データ（種別により異なる。下記「`proposalData` の構造」） |
| `reportData` | map? | — | 通報データ（種別により異なる）。`review_report` は `targetType`・`reviewId`・`playlistId`・`reason`・`detail` を持ち、承認時に `hiddenReviewSnapshot`（承認時点のレビュー内容: `userId`・`userDisplayName`・`starRating`・`comment`・`hasSpoiler`・`postedAt`・`updatedAt`）を追記する（管理 審査ワークフロー仕様書 §3.1） |
| `step1History` | map[] | ✅ | STEP1の審査履歴（配列） |
| `step1Errors` | map[] | ✅ | AI審査エラー記録（配列） |
| `step2History` | map[] | ✅ | STEP2の審査履歴（配列） |
| `editHistory` | map[] | ✅ | 申請内容の編集履歴（配列） |
| `operatorMemo` | string? | — | 運営メモ |
| `approvingAt` | Timestamp? | — | 再生リスト登録提案の承認処理中の印（同時承認の防止、2分で失効。処理後は削除。v1.22） |
| `submittedAt` | Timestamp | ✅ | 提出日時 |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

**`proposalData` の構造**（v1.22、フェーズ7ステップ7-4。提案は API Route（Admin SDK）からのみ作成し、クライアントからの `workflows` 作成は `review_report` に限る）

| 種別 | フィールド |
|------|-----------|
| `playlist_register` | `playlistUrl`・`youtubePlaylistId`・`title`・`thumbnailUrl`・`itemCount`・`channelId`・`channelName`・`channelIconUrl`（提案時点の YouTube の情報）・`gameId`・`gameName`（新しいゲームタイトルとして提案した場合はどちらも null で、`newGameTitle`・`newGameNote`（null 可）を持つ）。承認時に `registeredPlaylistId`、ゲームタイトルを差し替えて承認した場合は `approvedGameId`・`approvedGameName` を追記。v1.23: 新しいゲームタイトルの場合は `newGamePlatforms`（string[]、任意）と `newGameRakuten`（楽天ブックスの候補から選んだ場合の `itemUrl`・`title`（元の商品名）・`imageUrl`・`hardware`・`booksGenreId`、それ以外は null）。却下時に `rejectReasonCode`（定型の見送り理由、管理 審査ワークフロー仕様書 §14.4） |
| `game_title_register` | `playlistUrl`・`gameTitle`・`note`（null 可）。承認時に `createdGameId`（登録したゲームタイトルのID）を追記。v1.22 の改訂（同日）以降は新規作成しない（新しいゲームタイトルは `playlist_register` の `newGameTitle` で提案する） |

**`editHistory` 要素の構造**（v1.22 時点では再生リスト登録提案のゲームタイトル差し替えのみ）: `editedAt`（Timestamp）・`operatorId`・`field`（`"gameId"`）・`from`・`to`

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
| `userName` | string? | — | 送信時点の送信者の表示名（`users.displayName` のスナップショット。ゲストはnull） |
| `email` | string | ✅ | 返信先メールアドレス。ログイン済みはサーバー側でアカウントのメールアドレスを入れる（フォーム仕様書 §3） |
| `category` | string | ✅ | お問い合わせ種別。`"bug"`（不具合・バグ報告）/ `"account"`（アカウントについて）/ `"content"`（掲載内容について）/ `"feedback"`（ご意見・ご要望）/ `"other"`（その他） |
| `body` | string | ✅ | お問い合わせ内容（2,000文字以内）。スレッドでは先頭のユーザーメッセージとして表示する |
| `relatedUrls` | string[] | ✅ | 関連URL（0〜5件、`http(s)://` で始まるもの） |
| `status` | string | ✅ | `"open"`（未対応）/ `"in_progress"`（対応中）/ `"on_hold"`（保留中）/ `"resolved"`（対応済み＝スレッドのクローズ状態） |
| `isGuest` | boolean | ✅ | ゲスト送信フラグ（ゲストのお問い合わせにはスレッドを作らない） |
| `operatorMemo` | string? | — | 対応メモ（1,000文字以内、管理者のみ閲覧） |
| `lastAdminMessageAt` | Timestamp? | — | 管理者が最後にスレッドへ返信した日時（ユーザー側の未読判定用） |
| `userLastReadAt` | Timestamp? | — | 送信者本人が最後にスレッド詳細を開いた日時。`lastAdminMessageAt` より古ければ未読 |
| `awaitingAdminReply` | boolean? | — | ユーザーが返信して管理者がまだ返信していない状態（管理画面の「ユーザー返信あり」）。ユーザーの返信で `true`、管理者の返信・クローズで `false`。未設定は `false` 扱い |
| `attachments` | map[]? | — | お問い合わせ内容に添付した画像（0〜3件、構造は下記「添付画像」）。未設定は添付なし |
| `hasAttachments` | boolean? | — | このお問い合わせ（本体または `messages`）に削除前の添付画像がある。添付時に `true`、保存期間での削除後に `false`。削除処理の対象を絞るために使う |
| `resolvedAt` | Timestamp? | — | ステータスを「対応済み」にした日時。対応済み以外へ戻すと null。添付画像の保存期間（180日）の起点 |
| `submittedAt` | Timestamp | ✅ | お問い合わせ送信日時 |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

**サブコレクション**: `inquiries/{inquiryId}/messages/{messageId}`（ログイン済みユーザーのお問い合わせのみ。最初のお問い合わせ内容は含めず、その後の返信だけを入れる）

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `senderId` | string? | — | 送信者ID |
| `senderType` | string | ✅ | `"user"` / `"admin"` |
| `body` | string | ✅ | メッセージ本文（2,000文字以内） |
| `attachments` | map[]? | — | 添付画像（0〜3件、ユーザーのメッセージのみ。構造は下記「添付画像」） |
| `sentAt` | Timestamp | ✅ | 送信日時 |

**添付画像**（`attachments` の要素。ページ お問い合わせフォーム仕様書 §9、v1.24）

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `id` | string | ✅ | ランダムな英数字20文字。Storage のファイル名 `inquiries/{inquiryId}/{id}.{ext}` に使う |
| `format` | string | ✅ | 再エンコード後の形式。`"png"` / `"jpeg"` / `"webp"`（拡張子はそれぞれ `png`・`jpg`・`webp`） |
| `width` / `height` | number | ✅ | 再エンコード後の画素数（表示前に枠を確保するため） |
| `size` | number | ✅ | 再エンコード後のバイト数 |
| `deletedAt` | Timestamp? | — | 保存期間を過ぎて Storage から削除した日時。削除前は null |

> **設計注記（v1.19、フェーズ7ステップ7-3-1）**: 書き込みは API Route（Admin SDK）のみ。送信は `POST /api/inquiries`、管理操作
> （ステータス変更・対応メモ・返信・クローズ・再オープン）は `PATCH /api/admin/inquiries/{inquiryId}`。フォームに件名欄が無いため
> 旧版の `subject` を削除し、`body`・`relatedUrls` を追加。ステータスは管理仕様書 §3.4 の4状態に合わせ、旧版の `"closed"` は
> `"resolved"` に統合した。削除は行わない（管理 お問い合わせ管理仕様書 §6）。
> **読み取り経路（v1.21、7-3-2）**: `operatorMemo` を送信者に渡さないため、`inquiries` と `messages` のクライアント読み取りは管理者のみとし、
> 送信者本人は API（`GET /api/inquiries`・`GET /api/inquiries/{inquiryId}`、Admin SDK）経由で公開項目だけを受け取る。
> ユーザーの返信・再オープンは `POST /api/inquiries/{inquiryId}`（管理 お問い合わせ管理仕様書 §1.1、2026-10-24 ユーザー決定）。
> **添付画像（v1.24）**: 画像の本体は Cloud Storage（Firebase のデフォルトバケット）の `inquiries/{inquiryId}/` に置き、Firestore には添付情報だけを持つ。
> `storage.rules` でクライアントの読み書きを全て拒否し、閲覧は本人用 `GET /api/inquiries/{inquiryId}/attachments/{fileName}` と管理者用
> `GET /api/admin/inquiries/{inquiryId}/attachments/{fileName}` の API だけ。対応済みから180日で画像を削除する（管理 お問い合わせ管理仕様書 §6）。

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
| `type` | string | ✅ | `"quota_exceeded"` / `"fraud_detected"` / `"review_lv2"` / `"collection_completed"` / `"ai_review_error"` |
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

コンテンツ収集（チャンネル起点の探索、AI運営者 コンテンツ収集機能仕様書 v3.0 §3）で集めた再生リスト候補。書き込みは API Route（Admin SDK）のみ。

**パス**: `collection_candidates/{playlistId}`（ドキュメントIDは YouTube の再生リストID。同じ再生リストを二重に候補化しない）

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `playlistId` | string | ✅ | YouTubeの再生リストID |
| `playlistTitle` | string | ✅ | 再生リストタイトル |
| `channelId` | string | ✅ | YouTubeチャンネルID |
| `channelTitle` | string | ✅ | チャンネル名 |
| `explorationChannelId` | string | ✅ | 見つけた探索対象チャンネル（`exploration_channels` のドキュメントID） |
| `thumbnailUrl` | string | ✅ | サムネイルURL |
| `videoCount` | number | ✅ | 動画数（探索時点の `contentDetails.itemCount`） |
| `playlistPublishedAt` | Timestamp? | — | 再生リストの作成日時（`snippet.publishedAt`） |
| `guessedGameId` | string? | — | 推定したゲームタイトルID（推定なしは null） |
| `guessedGameTitle` | string? | — | 推定したゲームタイトル名（denormalized） |
| `gameQuery` | string | ✅ | 楽天ブックス検索に使うゲーム名らしい語句（§3.4） |
| `titleTagIds` | string[] | ✅ | タイトルの語句から拾ったタグID（運営者タグのみ）。チャンネル単位タグは承認時に `exploration_channels.tagIds` から加える |
| `source` | string | ✅ | `"channel"`（将来 `"game_search"` を追加） |
| `status` | string | ✅ | `"pending"` / `"registered"` / `"rejected"` |
| `collectedAt` | Timestamp | ✅ | 収集日時 |
| `reviewedAt` | Timestamp? | — | 承認・却下日時 |
| `reviewedBy` | string? | — | 承認・却下した管理者のuserId |
| `reviewComment` | string? | — | 却下理由など（自動却下時は `"not_public"` 等） |
| `registeredPlaylistId` | string? | — | 登録した `playlists` のドキュメントID |
| `rakutenSearch` | map? | — | 承認前の楽天ブックス検索の結果（収集候補レビューUI仕様書 v2.2 §3.7）。`title`（検索したゲーム名・検索語）・`query`（結果が出た検索語）・`items`（最大10件。各 `jan`・`title`・`hardware`・`imageUrl`・`salesDate`）・`searchedAt`。未検索は無し |

> v1.25 で旧設計（ジャンル起点）の `genreId`・`genreName`・`aiOperatorId`・`aiResult`・`aiFlags`・`aiComment`・`latestVideoPublishedAt` と `approved` 状態を削除した。AI判定のフィールドは Gemini 導入時に追加する。

---

### 3.24 `collection_batch_logs`

コンテンツ収集（探索）の実行結果ログ。

**パス**: `collection_batch_logs/{logId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `executedAt` | Timestamp | ✅ | 実行日時 |
| `trigger` | string | ✅ | `"manual"`（管理画面のボタン）/ `"cron"`（Cloud Scheduler） |
| `executedBy` | string? | — | 実行した管理者のuserId（cron は null） |
| `processedChannels` | number | ✅ | 探索したチャンネル数 |
| `playlistsFetched` | number | ✅ | 取得した再生リスト数 |
| `candidatesFound` | number | ✅ | 新しく保存した候補数 |
| `skippedByFilter` | number | ✅ | ハードフィルタで除外した数 |
| `skippedExisting` | number | ✅ | 登録済み・候補化済みで除外した数 |
| `status` | string | ✅ | `"success"` / `"partial"` / `"skipped"` / `"error"` |
| `quotaConsumed` | number | ✅ | 消費クォータ |
| `errors` | array | ✅ | `{ explorationChannelId, message }` の配列 |

---

### 3.25 `collection_quota_logs`

コンテンツ収集（チャンネル特定・探索・承認）によるクォータ消費の日別積算。

**パス**: `collection_quota_logs/{YYYY-MM-DD}`（日本時間の日付。1日1ドキュメント）

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `date` | string | ✅ | 日付（`YYYY-MM-DD`、日本時間） |
| `quotaConsumed` | number | ✅ | その日の消費ユニット数（加算） |
| `recordedAt` | Timestamp | ✅ | 最終更新日時 |

### 3.26 `ai_operators`

AI運営者（審査AI）の設定。プラットフォーム共通で1体のみ定義。

**パス**: `ai_operators/{aiOperatorId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | 対応する `users` ドキュメントID |
| `displayName` | string | ✅ | AI運営者表示名（例：`"プレミテ審査AI"`） |
| `isEnabled` | boolean | ✅ | 有効フラグ |
| `createdAt` | Timestamp | ✅ | 生成日時 |

---

### 3.27 `ng_words`

レビューコメント等の入力禁止ワード。

**パス**: `ng_words/{ngWordId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `word` | string | ✅ | NGワード |
| `createdBy` | string | ✅ | 登録者のuserId |
| `createdAt` | Timestamp | ✅ | 登録日時 |

---

### 3.28 `app_settings`

アプリ全体の設定値マスタ。

**パス**: `app_settings/{settingId}`

| フィールド例 | 型 | 説明 |
|------------|-----|------|
| `fraudThreshold` | number | 不正検知閾値 |

---

### 3.29 `new_title_candidates`

新作タイトル検知バッチが収集した、マスタ未登録のゲームタイトル候補。

**パス**: `new_title_candidates/{candidateId}`

> ドキュメントIDは 楽天ブックスのitemCode（`rakutenItemCode`）を使用することを推奨。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `rakutenItemCode` | string | ✅ | 楽天ブックスのitemCode |
| `rakutenItemName` | string | ✅ | 楽天ブックスの元の商品名 |
| `titleCandidates` | string[] | ✅ | AI等で正規化したタイトル名称の候補 |
| `platforms` | string[] | ✅ | 対象プラットフォーム（例：`["Nintendo Switch", "PS5"]`） |
| `packageImageUrl` | string? | — | パッケージ画像URL |
| `rakutenUrl` | string? | — | 楽天ブックスの商品ページURL |
| `description` | string? | — | 商品説明文 |
| `genreId` | string? | — | 対応するジャンルID（`genres` コレクション） |
| `genreName` | string? | — | ジャンル名（denormalized） |
| `themeIds` | string[] | ✅ | 対応するテーマIDリスト（`themes` コレクション） |
| `status` | string | ✅ | `"pending"` / `"approved"` / `"rejected"` / `"registered"` |
| `detectedAt` | Timestamp | ✅ | バッチによる検知日時 |
| `reviewedAt` | Timestamp? | — | オーナーによる確認日時 |
| `reviewedBy` | string? | — | 確認したオーナーのuserId |
| `reviewComment` | string? | — | オーナーのコメント |

---

### 3.30 `notifications`

ユーザー向けサイト内通知（ヘッダーベルアイコン・通知一覧ページ`/notifications`）。
ユーザー通知機能仕様書に定義された4種別（シリーズ新着・お知らせ・審査結果・
お問い合わせ返信）のうち、フェーズ2では「シリーズ新着通知」のみ実装する
（他3種別は依拠する機能＝お知らせ管理・審査ワークフロー・お問い合わせ機能が
未実装のためスコープ外。`type`フィールドは将来の種別追加を見込んだ設計とする）。
管理者向け`admin_notifications`（3.19節）とは別物。

**パス**: `notifications/{notificationId}`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | 通知の宛先ユーザーのuserId |
| `type` | string | ✅ | 通知種別。`"series_new_episode"`（フェーズ2）／`"inquiry_reply"`（お問い合わせ返信、フェーズ7ステップ7-3-2）／`"review_result"`（再生リスト登録提案の審査結果、v1.23） |
| `workflowId` | string? | — | 対象ワークフローのドキュメントID（`review_result`のみ）。承認時は `playlistId` に登録した再生リストのIDも入れる |
| `playlistId` | string? | — | 対象再生リストのドキュメントID（`series_new_episode`のみ） |
| `playlistTitle` | string? | — | 再生リストタイトル（denormalized、通知本文組み立て用） |
| `inquiryId` | string? | — | 対象お問い合わせのドキュメントID（`inquiry_reply`のみ） |
| `message` | string | ✅ | 通知本文（例：「「〇〇実況」に新しい動画が追加されました」） |
| `isRead` | boolean | ✅ | 既読フラグ（デフォルト：`false`）。既読から未読へは戻さない |
| `createdAt` | Timestamp | ✅ | 通知生成日時 |

> **設計注記**: 生成はAdmin SDK経由（新着動画の取得API Route、お問い合わせの返信API Route）のみ。クライアントからの
> `create`は許可しない（firestore.rules参照）。90日保持・自動削除ポリシー
> （仕様書8章）は、本格的なCloud Scheduler運用と合わせて別途対応する
> （フェーズ2では未実装）。

---

### 3.31 `inquiry_upload_counters`

お問い合わせの画像添付の1日の上限（ユーザーごとに20枚、ページ お問い合わせフォーム仕様書 §9.2）を数えるカウンター。v1.24 で追加。

**パス**: `inquiry_upload_counters/{userId}_{YYYYMMDD}`（日付は日本時間）

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `userId` | string | ✅ | 対象ユーザー |
| `date` | string | ✅ | `YYYYMMDD`（日本時間） |
| `count` | number | ✅ | その日に保存した添付画像の枚数（フォームと返信の合計） |
| `updatedAt` | Timestamp | ✅ | 最終更新日時 |

> **設計注記**: 送信・返信の API がお問い合わせの書き込みと同じトランザクションで加算し、上限を超えるなら書き込まない。
> クライアントからは読み書きしない（rules の既定の拒否に任せる）。7日より前の日付のものは添付画像の削除処理がついでに消す。

---

### 3.32 `exploration_channels`

コンテンツ収集の探索対象チャンネル（AI運営者 コンテンツ収集機能仕様書 §3.1）。書き込みは API Route（Admin SDK）のみ。

**パス**: `exploration_channels/{docId}`（自動ID）

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| `name` | string | ✅ | 登録時の名前（wiki の表記など） |
| `status` | string | ✅ | `"unresolved"` / `"pending_confirm"` / `"active"` / `"excluded"` |
| `youtubeChannelId` | string? | — | 確定したYouTubeチャンネルID（`active` のみ） |
| `channelTitle` | string? | — | 確定したチャンネル名 |
| `channelIconUrl` | string? | — | 確定したチャンネルのアイコンURL |
| `subscriberCount` | number? | — | 確定時点の登録者数（非公開は null） |
| `searchCandidates` | array | ✅ | 名前検索の候補 `{ youtubeChannelId, title, iconUrl, subscriberCount }`（最大5件。確定後は空） |
| `tagIds` | string[] | ✅ | チャンネル単位タグ（運営者タグのみ）。承認時に付与する |
| `lastExploredAt` | Timestamp? | — | 最終探索日時 |
| `lastFoundCount` | number? | — | 前回の探索で新しく保存した候補数 |
| `createdAt` | Timestamp | ✅ | 登録日時 |
| `createdBy` | string | ✅ | 登録した管理者のuserId |
| `updatedAt` | Timestamp | ✅ | 更新日時 |

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
| `inquiries` | `hasAttachments` (asc) + `resolvedAt` (asc) | 保存期間を過ぎた添付画像の削除対象（v1.24） |
| `collection_candidates` | `status` (asc) + `collectedAt` (desc) | ステータス別候補一覧 |

---

## 6. セキュリティルール方針

- **一般公開**: `playlists` (isPublic=true), `games`, `genres`, `tags`, `reviews` はゲストR可。
- **個人データ**: `mylist`, `watch_progress`, `watch_history` は自分のみRW可。
- **まとめ**: `collections` は公開・限定公開ならゲストR可、非公開は作成者本人と管理者のみR可。書き込みはAPI Route（Admin SDK）のみ（3.14節）。
  `saved_collections` は本人と管理者のみR可、書き込みはAPI Routeのみ（3.14.1節）。
- **お問い合わせ**: `inquiries`（と `messages`）は管理者のみR可（送信者本人は API 経由、v1.21）。書き込みはAPI Route（Admin SDK）のみ（3.17節）。
  `inquiry_upload_counters` はクライアントから読み書き不可（3.31節）。添付画像の Cloud Storage は `storage.rules` でクライアントの読み書きを全て拒否する（v1.24）。
- **管理データ**: `workflows`, `ai_operators`, `app_settings` は管理者のみRW可。
- **不変ログ**: `operation_logs` はシステムのみW、管理者はRのみ。

---

## 7. データ整合性・削除ポリシー

### 7.1 退会時の物理削除
- `users`, `reviews`, `mylist`, `watch_history`, `watch_progress`, `helpful_votes`, `collections` を物理削除。
- `saved_collections` は本人の保存記録に加え、削除される本人のまとめに対する他ユーザーの保存記録も物理削除する（3.14.1節）。

### 7.2 マスタ削除時の影響
- `genres` 物理削除時: `games.genreId` を null 化。AI運営者への影響なし。
- `games` 物理削除時: `playlists.gameId` を null 化。

### 7.3 マスタ編集時の非正規化フィールド同期

- `games` 編集時（`PATCH /api/admin/games/{gameId}`、ページ ゲームタイトル 詳細 仕様書 第7章）:
  - `title` 変更 → 紐づく `playlists.gameName` を同期
  - `genreId` 変更 → `games.genreName` を再解決し、紐づく `playlists.gameGenreIds` を同期。旧ジャンル `genres.gameTitleCount` を -1、新ジャンルを +1
  - `themeIds` 変更 → 外れたテーマの `themes.gameTitleCount` を -1、追加されたテーマを +1

---

## 8. 改訂履歴

| バージョン | 日付 | 内容 |
|-----------|------|------|
| v1.0 | 2026-03-20 | 初版作成 |
| v1.1 | 2026-03-20 | weekly_ranking_snapshots コレクションを削除 |
| v1.2 | 2026-03-24 | バッチ名称の統一（video_update/channel_update） |
| v1.3 | 2026-03-24 | games コレクションに rakutenItemName フィールドを追加 |
| v1.4 | 2026-03-30 | AI運営者の1体統合に伴う定義更新。ai_operators のジャンルフィールド削除。collection_candidates のジャンルフィールドをコンテキストとして再定義。破損ドキュメントの復旧。 |
| v1.5 | 2026-03-30 | 不要な `genre_search_keywords` コレクションの定義を削除。タイトルベース収集への移行に伴うクリーンアップ。 |
| v1.6 | 2026-03-30 | admin_notifications に AI審査エラー通知タイプ（`ai_review_error`）を追加。 |
| v1.7 | 2026-03-30 | `new_title_candidates` コレクションの定義を追加（新作タイトル検知バッチ用）。バージョン表記の整合性を修正。 |
| v1.8 | 2026-09-11 | `mylist` に `watchStatus`・`isReverseOrder` フィールドを追加（マイリスト機能仕様書準拠、フェーズ2実装に伴うスキーマギャップ解消） |
| v1.9 | 2026-09-11 | `users` に `isContinuousPlayEnabled` フィールドを追加（動画プレーヤー仕様書の連続再生設定準拠、フェーズ2実装に伴うスキーマギャップ解消） |
| v1.10 | 2026-09-11 | `notifications` コレクションを新規追加（ユーザー通知機能仕様書準拠。フェーズ2ではシリーズ新着通知のみ実装、他3種別は将来対応） |
| v1.12 | 2026-09-21 | 7.3節「マスタ編集時の非正規化フィールド同期」を追加（`games` 編集時の `playlists.gameName`/`gameGenreIds`、`genres`/`themes.gameTitleCount` の同期ポリシー） |
| v1.11 | 2026-09-13 | フェーズ3ステップ1（レビュー・スコアリング機能）実装に伴うスキーマギャップ解消。`reviews` に投稿者表示用の非正規化コピー `userDisplayName`/`userProfileImageUrl` を追加（HANDOFF.md未解決事項1の対応）。`reviews.commentScore` の説明を実装（共通 信頼度スコアリングシステム仕様書 §3.3準拠、あり:1.0/なし:0.5の2値）に合わせて修正（旧記載の「0.2/0.5/1.0」は誤記）。`reviews` ドキュメントIDが `{userId}_{playlistId}` 形式であることを明記。`users` に `hideSpoilerReviews` を追加（レビュー投稿機能仕様書のネタバレフィルター設定の永続化用）。 |
| v1.13 | 2026-09-23 | `reviews.watchStatus` から `"reviewing"` を削除し、`mylist.watchStatus` と同じ5値に統一（視聴ステータス記録UI・レビュー投稿UI統合）。3.11節の設計注記を「`mylist.watchStatus` が正、`reviews.watchStatus` はその非正規化コピー」に更新 |
| v1.14 | 2026-09-26 | `users` に `hideUpcomingThumbnails` を追加（動画リストのネタバレ対策。設定ページから変更、既定 `false`） |
| v1.15 | 2026-10-03 | マイリストページからの削除（app/api/mylist の DELETE）で `reviews.watchStatus` も解除するよう変更（ページ マイリスト機能仕様書 §5.9）。3.9節 `reviews.watchStatus` の書き込み経路と3.11節の設計注記を更新 |
| v1.16 | 2026-10-08 | フェーズ6ステップ4（まとめ機能 4-1）。`collections` に作成者表示用の非正規化コピー `userDisplayName`/`userProfileImageUrl` と表示順 `sortOrder` を追加し、書き込み経路（API Route のみ）を明記。6章のルール方針で `collections` を個人データから分離 |
| v1.17 | 2026-10-12 | フェーズ6ステップ4-3（まとめの保存機能）。3.14.1 `saved_collections` を追加（保存記録、書き込みはAPI Routeのみ、まとめ削除時に連動削除）。6章のルール方針に追記 |
| v1.18 | 2026-10-12 | フェーズ6ステップ5-2。`users.isMylistPublic`/`isReviewHistoryPublic` の既定値を実装（`true`）に合わせて修正。`reviews`/`collections` の `userDisplayName` がプロフィールでの表示名変更時に揃えられることを追記 |
| v1.19 | 2026-10-14 | フェーズ7ステップ7-3-1（お問い合わせ）。3.17 `inquiries` をフォーム仕様に合わせて改訂（`subject` 削除、`body`・`relatedUrls` 追加、`status` を4状態に、`userName` をゲスト null 可に）、書き込み経路（API Route のみ）を明記。6章のルール方針に追記 |
| v1.20 | 2026-10-24 | 通報承認時のレビュー処理を論理削除に変更（管理 審査ワークフロー仕様書 v9.0 §3.1）。`reviews` に `isHidden`・`hiddenAt`・`hiddenByWorkflowId` を追加。`workflows.reportData.hiddenReviewSnapshot` に承認時点のレビュー内容を退避する |
| v1.21 | 2026-10-24 | フェーズ7ステップ7-3-2（お問い合わせ履歴）。§3.17 `inquiries` に `lastAdminMessageAt`・`userLastReadAt`・`awaitingAdminReply` を追加し、送信者本人の読み取りを API 経由に変更。§3.30 `notifications` に `inquiry_reply` 種別と `inquiryId` を追加 |
| v1.22 | 2026-10-25 | フェーズ7ステップ7-4（一般ユーザーの提案フロー）。§3.15 `workflows` に `proposalData`（`playlist_register`・`game_title_register`）と `editHistory` の構造を定義し、提案の作成を API 経由に限定。`playlists.proposedBy` を追加 |
| v1.23 | 2026-10-25 | 再生リスト提案フローの作り込み。`workflows` の本人による直接読み取りを通報（`review_report`）に限定（提案は運営メモ・内部メモを含むため提案履歴 API 経由）。`games.aliases`（別名）、`workflows.proposalData` に `newGamePlatforms`・`newGameRakuten`・`rejectReasonCode`、`notifications` に `review_result` 種別と `workflowId` を追加 |
| v1.24 | 2026-10-27 | お問い合わせの画像添付。§3.17 `inquiries` に `attachments`・`hasAttachments`・`resolvedAt`、`messages` に `attachments` と添付画像の構造を追加。§3.31 `inquiry_upload_counters` を新設。§5.2 にインデックス、§6 に Storage のルール方針を追加 |
| v1.25 | 2026-10-28 | フェーズ7-5（友人テスト前のコンテンツ充実）。コンテンツ収集をチャンネル起点に変更したことに合わせ、3.23 `collection_candidates` をタイトル・チャンネル起点のスキーマに改訂（ドキュメントIDを再生リストIDに、ゲーム推定・タグ候補を追加、ジャンル起点・AI判定のフィールドを削除）、3.24 `collection_batch_logs`・3.25 `collection_quota_logs` を改訂、3.32 `exploration_channels` を追加 |
| v1.26 | 2026-10-30 | 3.23 `collection_candidates` に `rakutenSearch`（承認前の楽天ブックス検索の結果）を追加 |
