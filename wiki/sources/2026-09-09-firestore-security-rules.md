---
title: Firestoreセキュリティルールの本設計・本番デプロイ
type: source
date: 2026-09-09
updated: 2026-09-09
commit: 4f4be9c
---

# Firestoreセキュリティルールの本設計・本番デプロイ

`HANDOFF.md` の未解決事項#1（最優先ブロッカー。Firestoreが `if false` で全閉鎖中）への対応。

## やったこと

1. `firestore.rules` を新規作成し、29コレクション全てにルールを定義。
2. `firestore.indexes.json` を新規作成し、設計書セクション5の複合インデックスを反映。
3. `firebase.json` に `firestore.rules` / `firestore.indexes.json` を組み込み。
4. `firebase deploy --only firestore:rules,firestore:indexes --project tr-game-streamer` を実行し、
   本番プロジェクトに反映（dry-runでコンパイル確認後に実施）。
5. `HANDOFF.md` の未解決事項#1をクローズ扱いに更新。

## 設計方針（詳細は [[firestoreセキュリティルール方針]] 参照）

- ロール判定はFirebase Auth Custom Claims の `role` を正とする
  （`users/{uid}.role` フィールドは管理画面表示用のミラー、ルール判定には使わない）。
- 参照した仕様書: `document/specification/db/Firestore データモデル設計書.md`（v1.7）セクション6、
  `document/specification/common/共通 機能別権限表 仕様書.md`（v1.1）。

## 積み残し・要確認事項

- レビュー一覧等で投稿者の `displayName`/`profileImageUrl` を表示する機能を作る際、
  `users` ドキュメントは本人・管理者以外読めない設計にしたため、`reviews` 側への
  非正規化コピーなど別の参照方法を機能実装時に検討する必要あり。
- `collection_candidates`/`new_title_candidates` の承認操作を「オーナー限定」にすべきか
  「管理者（オーナー・運営者）共通」にすべきかは仕様書に明記がなく、暫定的に管理者共通で許可。
- ステージング環境（`tr-game-streamer-stg`）へは未デプロイ。

## 関連
- [[firestoreセキュリティルール方針]]（判定ロジックの詳細・コレクション別ポリシー表）
