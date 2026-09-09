---
title: Firestoreセキュリティルール方針
type: concept
date: 2026-09-09
updated: 2026-09-09
---

# Firestoreセキュリティルール方針

[[2026-09-09-firestore-security-rules]] で `firestore.rules` を新設した際の設計判断のまとめ。
以降、コレクションを追加・変更する際はこの方針に沿ってルールも更新すること。

## ロール判定

- **Firebase Auth Custom Claims の `role` を正とする**（`request.auth.token.role`）。
  クライアントから偽装できないため。Custom ClaimsはCloud Functionsからのみ設定される想定。
- `users/{uid}.role` フィールドは管理画面の一覧表示用ミラーであり、ルール判定には使わない。
- `role`: `"user"` | `"operator"` | `"owner"` | `"ai_operator"`。
  `isAdmin()` ヘルパーは `role == 'owner' || role == 'operator'` を指す。
- AI運営者（`ai_operator`）はCloud Functions（Admin SDK）経由でのみ書き込む前提のため、
  ルール上でAI運営者向けの特別な許可は設けていない（Admin SDKはルールを常にバイパスする）。

## コレクション別ポリシーの分類

| 分類 | 該当コレクション | 読み取り | 書き込み |
|---|---|---|---|
| 公開マスタ | `channels` `games` `genres` `themes` `tags` `videos` | 誰でも | 管理者のみ（`tags`の新規作成のみ一般ユーザー可） |
| 公開コンテンツ | `playlists`（`isPublic=true`のみ）`reviews` | 誰でも | 管理者のみ／投稿者本人（フィールド限定） |
| 個人データ | `mylist` `watch_progress` `watch_history` `collections` `helpful_votes` | 本人＋管理者 | 本人のみ作成、本人＋管理者が更新削除 |
| 審査・お問い合わせ | `workflows` `inquiries`（+`messages`サブコレクション） | 本人＋管理者 | 作成は本人、進行管理は管理者 |
| システム内部ログ | `operation_logs` `admin_notifications` `fraud_alerts` `batch_logs` `api_quota_logs` `collection_candidates` `collection_batch_logs` `collection_quota_logs` `new_title_candidates` `ng_words` `app_settings` `ai_operators` | 管理者のみ | クライアントからは原則不可（Cloud Functions=Admin SDK限定）。承認系フィールドのみ管理者が更新可 |
| 公開/非公開切替 | `notices` | `status=='published'`のみ公開、他は管理者 | 管理者のみ |

## 部分フィールド更新の扱い

Firestoreルールはドキュメント単位が基本だが、以下は `diff().affectedKeys().hasOnly([...])` で
フィールド単位の権限分離を実装している（`onlyChangedKeys()` ヘルパー）。

- `users`: 本人はプロフィール系フィールドのみ変更可。`role`/BAN関連/集計値は管理者のみ。
- `playlists`: 一般ユーザーは `playlistTagIds`（通常タグ）のみ変更可。本体情報・固定タグは管理者のみ。
  → [[共通 機能別権限表 仕様書]] の「通常タグの追加・削除 ✅一般ユーザー」に対応。
- `reviews`: 本人は評価・コメント等のみ変更可。`helpfulCount`/`trustScore`等の集計値はCloud Functions側で算出するため本人でも変更不可。
- `collection_candidates` / `new_title_candidates` / `fraud_alerts` / `admin_notifications`:
  管理者による承認・対応系フィールドのみ更新可（生成はCloud Functions限定）。

## 意図的に将来課題として残した点

- `users` ドキュメントは本人・管理者以外読めないため、他ユーザーへの表示名公開手段が未設計
  （`reviews`等への非正規化コピーが必要になる見込み）。
- NGワード一覧（`ng_words`）はクライアントに公開しない方針（回避策を助長しないため）。
  コメント投稿時のNGワード判定はCloud Functions（Admin SDK）側で行う想定。

## 関連
- [[2026-09-09-firestore-security-rules]]（このルールを作成・デプロイしたセッション記録）
- 設計根拠: `document/specification/db/Firestore データモデル設計書.md` セクション6、
  `document/specification/common/共通 機能別権限表 仕様書.md`
