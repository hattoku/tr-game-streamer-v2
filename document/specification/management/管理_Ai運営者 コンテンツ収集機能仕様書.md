# AI運営者_コンテンツ収集機能仕様書

**バージョン**: v1.0
**作成日**: 2026年3月16日
**関連ドキュメント**: ゲムコメ_AI運営者_企画書 / AI運営者_YouTube API調査レポート / AI運営者_コンテンツ品質基準検討書 / ゲムコメ_YouTube定期取得仕様書 / ゲムコメ_技術スタック仕様書

---

## 目次

1. [概要](#1-概要)
2. [アーキテクチャ](#2-アーキテクチャ)
3. [Function C：コンテンツ収集バッチ](#3-function-cコンテンツ収集バッチ)
4. [APIリクエスト設計](#4-apiリクエスト設計)
5. [Gemini APIによる品質スクリーニング](#5-gemini-apiによる品質スクリーニング)
6. [Firestoreへの書き込み](#6-firestoreへの書き込み)
7. [クォータ管理](#7-クォータ管理)
8. [エラーハンドリング](#8-エラーハンドリング)
9. [検索キーワードの管理](#9-検索キーワードの管理)
10. [改訂履歴](#10-改訂履歴)

---

## 1. 概要

本仕様書は、AI運営者が担当ジャンルのYouTubeを定期的に巡回し、ゲムコメへの登録候補となる再生リストを自律的に収集・スクリーニングするバッチ機能（Phase 2）の実装仕様を定義する。

収集された候補はFirestoreに保存され、管理画面の収集候補レビューUI（管理_AI運営者向け収集候補レビューUI仕様書）を通じてオーナーが確認・承認することで、ゲムコメへの再生リスト登録が完了する。

コンテンツの収集にはYouTube Data API v3のみを使用する。スクレイピングは利用規約で禁止されているため使用しない（AI運営者_YouTube API調査レポート 第4章参照）。

---

## 2. アーキテクチャ

```
Cloud Scheduler（週1回 日曜 03:00）
    ↓
Function C（AI運営者_コンテンツ収集バッチ）
    ↓
① クォータ残量チェック
    ├─ 残量不足 → スキップ通知・終了
    └─ 残量あり → 続行
    ↓
② Firestoreからジャンル一覧・検索キーワードを取得
    ↓
③ ジャンルごとに以下を繰り返す：
    search.list（キーワード検索）
        ↓
    playlists.list（詳細情報取得）
        ↓
    ハードフィルタ（動画数・重複・日本語）
        ↓
    playlistItems.list（動画一覧取得・フィルタ通過分のみ）
        ↓
    Gemini APIによる品質スクリーニング
        ↓
    Firestoreに収集候補として保存
    ↓
④ 実行ログをFirestoreに記録
    ↓
⑤ オーナーに通知
```

### 既存バッチとの関係

Function Cは既存のFunction A・Function Bとは独立したCloud Functionsとして実装する。クォータ消費の記録も独立したコレクション（`collection_quota_logs`）で管理し、既存の `api_quota_logs` とは分離する。

---

## 3. Function C：コンテンツ収集バッチ

### 3.1 実行タイミング

| 項目 | 仕様 |
|------|------|
| 実行タイミング | 毎週日曜 03:00（Cloud Scheduler） |
| 対象 | Firestoreに登録されている全ジャンルのAI運営者（有効状態のもの） |

週1回の実行を基本とする。AI運営者_YouTube API調査レポート第3章の試算（シナリオA：9ジャンルで約3,177ユニット/回）に基づき、既存バッチとの合算でデフォルトクォータ10,000ユニット/日の範囲内に収まることを確認している。

### 3.2 処理概要

```
Firestoreから有効なAI運営者一覧を取得
    ↓
AI運営者ごとに以下を順次実行：

  ① 担当ジャンルの検索キーワード一覧を取得
       （Firestore: genre_search_keywords/{genreId}）
       ↓
  ② キーワードごとに search.list を実行
       → 再生リストID一覧を取得（最大50件/キーワード）
       ↓
  ③ 取得した再生リストIDをまとめて playlists.list で詳細取得
       （最大50件を1リクエストで処理）
       ↓
  ④ ハードフィルタを適用
       → 動画数2本以下・登録済みID・取得不可を除外
       ↓
  ⑤ フィルタ通過分の再生リストに対して playlistItems.list を実行
       → 動画タイトル一覧・公開日時を取得（最大30件）
       ↓
  ⑥ Gemini APIで品質スクリーニング
       → result: "collect" の場合のみ収集候補として保存
       → result: "skip"（spam）の場合は記録せず除外
       ↓
  ⑦ Firestoreに収集候補レコードを書き込み

全ジャンル完了後：
  ⑧ 実行ログを記録
  ⑨ オーナーに収集完了通知を送信
```

### 3.3 ジャンルの処理順序

Firestoreから取得したジャンル一覧を固定順（ジャンルID昇順）で処理する。途中でクォータ残量が不足した場合は、処理済みのジャンルまでの結果を保存して終了し、次回の実行で全件処理を再開する（前回未処理分を優先する機能は初期実装では持たない）。

---

## 4. APIリクエスト設計

### 4.1 search.list

| パラメータ | 値 |
|-----------|-----|
| `part` | `snippet` |
| `type` | `playlist` |
| `q` | 検索キーワード（第9章参照） |
| `regionCode` | `JP` |
| `relevanceLanguage` | `ja` |
| `maxResults` | `50` |

返却される情報: 再生リストID・タイトル・チャンネルID・チャンネル名・サムネイル

### 4.2 playlists.list

| パラメータ | 値 |
|-----------|-----|
| `part` | `snippet,contentDetails` |
| `id` | 再生リストIDをカンマ区切りで最大50件指定 |

返却される情報: タイトル・チャンネルID・チャンネル名・作成日時・動画数

### 4.3 playlistItems.list

| パラメータ | 値 |
|-----------|-----|
| `part` | `snippet,contentDetails` |
| `playlistId` | 対象の再生リストID |
| `maxResults` | `30` |

返却される情報: 動画ID・動画タイトル・再生リスト内順番・動画公開日時

> **30件に制限する理由**: 品質スクリーニングに必要な情報（再生リストらしさ・更新継続性・完結判定）は先頭30件で十分に判定可能であり、クォータコストを抑えるために上限を設ける。

---

## 5. Gemini APIによる品質スクリーニング

### 5.1 モデルと呼び出し設定

AI運営者_審査機能仕様書 第5章と同様の設定を使用する。

| 項目 | 仕様 |
|------|------|
| モデル | Gemini Flash（最新安定版） |
| レスポンス形式 | JSON（`response_mime_type: "application/json"` を指定） |
| APIキー管理 | GCP Secret Manager |

### 5.2 システムプロンプト

```
あなたはゲーム実況動画の再生リスト視聴記録プラットフォーム「ゲムコメ」のコンテンツ収集AIです。
担当ジャンル: {genreName}

YouTubeから取得した再生リスト情報をもとに、ゲムコメへの登録候補として適切かどうかを判定してください。
以下のJSON形式のみで回答してください。余計なテキスト・マークダウン・説明文は一切含めないでください。

{
  "result": "collect" | "skip",
  "flags": ["flag_key", ...],
  "comment": "判定根拠の説明（日本語・200文字以内）"
}

result の定義:
- "collect" : 収集候補として登録する（フラグがあっても原則 collect）
- "skip"    : 除外する（spam フラグが確実な場合のみ）

flags の定義（該当するものをすべて含める。なければ空配列）:
- "not_gameplay"   : ゲーム実況・プレイ動画の再生リストではないと判断される
- "update_stopped" : 更新が長期間停止していると判断される
- "completed"      : 再生リストが完結済みと判断される
- "spam"           : スパム・荒らし・不正コンテンツの疑いが強い
- "non_japanese"   : 日本語コンテンツでないと判断される

判定の方針:
- spam フラグが確実な場合のみ result を "skip" にする
- それ以外のフラグ（not_gameplay・update_stopped・completed・non_japanese）は、
  result を "collect" にしたうえで flags に含めてオーナーの判断に委ねる
- 判断に迷う場合は "collect" を優先する
```

### 5.3 ユーザープロンプト

```
以下の再生リストをゲムコメへの登録候補として評価してください。

【再生リストタイトル】
{playlistTitle}

【チャンネル名】
{channelTitle}

【動画数】
{videoCount}本

【動画タイトル一覧（先頭から最大30件）】
{videoTitles（番号付きリスト形式）}

【各動画の公開日時（先頭から最大30件）】
{videoPublishedAts（番号付きリスト形式）}

【最終動画公開日時】
{latestVideoPublishedAt}

【判定実行日時】
{currentDateTime}
```

---

## 6. Firestoreへの書き込み

### 6.1 収集候補コレクション

収集候補は `collection_candidates` コレクションに保存する。

| フィールド | 型 | 内容 |
|-----------|-----|------|
| `playlistId` | string | YouTubeの再生リストID |
| `playlistTitle` | string | 再生リストタイトル |
| `channelId` | string | チャンネルID |
| `channelTitle` | string | チャンネル名 |
| `thumbnailUrl` | string | 再生リストサムネイルURL |
| `videoCount` | number | 動画数 |
| `latestVideoPublishedAt` | Timestamp | 最終動画公開日時 |
| `genreId` | string | 担当ジャンルID |
| `genreName` | string | 担当ジャンル名 |
| `aiOperatorId` | string | 収集したAI運営者のユーザーID |
| `aiResult` | string | `"collect"` |
| `aiFlags` | string[] | フラグキーの配列 |
| `aiComment` | string | AI判定コメント |
| `status` | string | `"pending"`（初期値）/ `"approved"` / `"rejected"` / `"registered"` |
| `collectedAt` | Timestamp | 収集日時 |
| `reviewedAt` | Timestamp \| null | オーナーがレビューした日時 |
| `reviewedBy` | string \| null | レビューしたオーナーのユーザーID |
| `reviewComment` | string \| null | オーナーのレビューコメント |

### 6.2 ステータス遷移

```
pending（収集直後）
    ├─ オーナーが承認 → approved
    │       ↓
    │   登録処理実行 → registered（再生リストをゲムコメに登録完了）
    └─ オーナーが却下 → rejected
```

### 6.3 重複チェック

収集候補の書き込み前に、同一の `playlistId` がすでに以下のいずれかに存在しないかを確認する。

- `playlists` コレクション（ゲムコメ登録済み）
- `collection_candidates` コレクションの `status: pending` または `approved`

どちらかに存在する場合はその再生リストをスキップし、収集候補に追加しない。

### 6.4 実行ログ

バッチ完了時に `collection_batch_logs` コレクションに実行ログレコードを書き込む。

| フィールド | 型 | 内容 |
|-----------|-----|------|
| `executedAt` | Timestamp | バッチ実行日時 |
| `processedGenres` | number | 処理したジャンル数 |
| `searchCount` | number | `search.list` の実行回数 |
| `candidatesFound` | number | 収集候補として保存した件数 |
| `skippedByFilter` | number | ハードフィルタで除外した件数 |
| `skippedBySpam` | number | スパム判定で除外した件数 |
| `quotaConsumed` | number | 消費クォータユニット数 |
| `status` | string | `"success"` / `"partial"` / `"skipped"` / `"error"` |
| `message` | string \| null | スキップ・エラー時の詳細メッセージ |

---

## 7. クォータ管理

### 7.1 事前チェック

Function C実行開始時に、当日の `collection_quota_logs` の累計消費量を確認する。推定消費量（ジャンル数 × シナリオA単価：約350ユニット）を加算した場合に3,500ユニットを超える場合はバッチをスキップする。

> **3,500ユニットの根拠**: 既存Function A/Bの最大消費（約2,000ユニット/回×2回=4,000）を考慮し、1日の総消費が10,000ユニットを超えないよう、Function C専用の上限を保守的に設定している。運用データを踏まえて調整する。

### 7.2 実行中の消費記録

各APIリクエスト実行後、消費ユニット数を `collection_quota_logs` コレクションに随時記録する。

### 7.3 クォータ超過時の通知

スキップが発生した場合は `admin_notifications` コレクションに通知レコードを作成し、オーナーに通知する（管理_お知らせ管理仕様書 第3章に準ずる）。

---

## 8. エラーハンドリング

| エラー種別 | 対応 |
|-----------|------|
| YouTube API呼び出し失敗 | 対象ジャンルの処理をスキップし、次のジャンルへ進む。エラーは実行ログに記録する |
| Gemini API呼び出し失敗 | 最大2回リトライ。失敗した場合は当該再生リストをスキップし、AIコメントなしで `status: pending` で保存することはしない（判定なしでの候補追加は行わない） |
| Gemini APIレスポンスのJSONパース失敗 | 当該再生リストをスキップする |
| Firestoreへの書き込み失敗 | リトライなし。エラーを実行ログに記録し、バッチのステータスを `"partial"` にする |

---

## 9. 検索キーワードの管理

### 9.1 Firestoreでの管理

検索キーワードはジャンルごとに `genre_search_keywords` コレクションで管理する。

| フィールド | 型 | 内容 |
|-----------|-----|------|
| `genreId` | string | ジャンルID |
| `keywords` | string[] | 検索キーワードの配列 |
| `updatedAt` | Timestamp | 最終更新日時 |
| `updatedBy` | string | 更新者のユーザーID |

### 9.2 初期キーワード

AI運営者_コンテンツ品質基準検討書 第5章で定義したジャンルごとのキーワード例を初期値として登録する。

### 9.3 管理画面からの編集

オーナーは管理画面の収集候補レビューUI（管理_AI運営者向け収集候補レビューUI仕様書 第5章）からジャンルごとの検索キーワードを追加・編集・削除できる。

---

## 10. 改訂履歴

| バージョン | 日付 | 内容 |
|-----------|------|------|
| v1.0 | 2026-03-16 | 初版作成 |