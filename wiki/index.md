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
