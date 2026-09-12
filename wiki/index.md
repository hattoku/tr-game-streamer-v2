---
title: Wiki索引
type: meta
date: 2026-09-08
updated: 2026-09-12
---

# Wiki 索引

tr-game-streamer-v2 の**コーディング支援用**Wiki（実装の変更履歴・技術的決定を記録）。
設計・企画レベルの検討は別リポジトリ `ak_tr_game_streamer_dev` が担当する
（役割分担は [[CLAUDE.md]] 参照）。プロジェクト全体像は [[overview]] を参照。

## Sources
- [[2026-09-09-firestore-security-rules]] — Firestoreセキュリティルールの本設計・本番デプロイ
- [[2026-09-09-tech-stack-upgrade]] — 技術スタックの最新化とバージョン固定
- [[2026-09-09-phase1-plan-review]] — フェーズ1計画の妥当性レビューとHANDOFF.md更新
- [[2026-09-10-master-data-seed-script]] — マスタデータ投入スクリプトの実装
- [[2026-09-10-auth-foundation]] — 認証まわりの実装土台（AuthContext・init-user API）
- [[2026-09-10-phase2-plan]] — フェーズ2計画の精緻化（依存チェーン・スキーマギャップ）
- [[2026-09-11-phase2.5-design-plan]] — フェーズ2.5（デザイン適用）計画（Tailwind導入・仕様書の穴埋め・8ステップ）
- [[2026-09-11-design-foundation]] — フェーズ2.5 ステップ0・1（仕様書の穴埋め、Tailwind v4＋Radix導入、components/ui）
- [[2026-09-11-layout-and-system-pages]] — フェーズ2.5 ステップ2（ルートグループ導入、ヘッダー/フッター/ドロワー、404/500/loading、TOP最小版）
- [[2026-09-12-playlist-detail-design]] — フェーズ2.5 ステップ3（再生リスト詳細の部品化・2カラム・シアターモード・マイリスト追加・ログイン要求モーダル）
- [[2026-09-12-design-direction-crimson]] — フェーズ2.5 ステップ4.5（デザイン方針の見直し: 4案比較→A. クリムゾン採用、トークン仕様書 v2.0、共通部品の作り直し）
- [[2026-09-12-mylist-design]] — フェーズ2.5 ステップ5（マイリスト: MylistCard 部品化、タブ・ソート・子エリア・新着行・空状態、最終話判定の索引回避）
- [[2026-09-12-notifications-design]] — フェーズ2.5 ステップ6（通知一覧・ヘッダーベルの未読バッジ、「タイムライン」廃止→ボトムタブ「マイリスト」、マイページは暫定 /history）
- [[2026-09-12-login-and-register-design-plan]] — フェーズ2.5 ステップ7（ログイン・再生リスト登録のデザイン適用）実装計画（スコープの線引き・バリデーション文言・ゲーム選択モーダル・確認手順・要確認の判断4点）
- [[2026-09-12-login-and-register-design]] — フェーズ2.5 ステップ7 実装記録（`/login` の signup モード・バリデーション・Firebase エラー日本語化、`/playlists/new` の確認エリア・GameSelectModal・PlaylistSummary・完了画面、撮影で focusout を使う話）

## Entities
- [[proxy]] — proxy.ts（旧middleware.ts、Next.js 16のproxy規約対応）

## Concepts
- [[firestoreセキュリティルール方針]] — ロール判定・コレクション別ポリシー
- [[依存バージョン固定方針]] — package.jsonのバージョン記法方針
- [[マスタデータ投入方針]] — 投入対象の規模・ID採番ルール・Admin SDK必須の理由
- [[ステージング環境運用方針]] — 設定は都度同期・データ検証はフェーズ4まで後回しの方針
- [[デザイントークン運用方針]] — 仕様書トークン→`@theme`の1対1対応、`@utility`のグラデーション面、1px半透明白の枠線、奥行きの3段階、刺し色の原則（2色目を足さない）、セレクトはSelectMenu、ヘッドレスUI方針

## Analyses
（まだページなし）

---
このindexはIngest / Query操作のたびに更新すること。
