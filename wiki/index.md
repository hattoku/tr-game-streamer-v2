---
title: Wiki索引
type: meta
date: 2026-09-08
updated: 2026-09-15
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
- [[2026-09-13-phase2.5-finish]] — フェーズ2.5 ステップ8 仕上げ（3幅確認で 768〜1023px のヘッダー折り返しを修正、キーボード/aria の実機確認と `aria-modal`、`next lint` 廃止と typescript-eslint の TS 7 未対応を受けた Babel パーサーによる ESLint 導入、react-hooks の指摘修正）。フェーズ2.5 完了
- [[2026-09-13-phase3-step1-reviews]] — フェーズ3 ステップ1（レビュー・スコアリング機能）。信頼度スコアはAdmin SDK側で算出、NGワードはサーバー側のみで判定、`reviews`への投稿者非正規化コピー追加、D=0で信頼度が0になる不具合と下限値対応
- [[2026-09-14-phase3-step2-games]] — フェーズ3 ステップ2（ゲームタイトル探す・詳細ページ）。`PlaylistGrid`の分解・再利用、実機確認で見つかった検索UI4件の修正（×ボタン二重表示・適用中フィルターの左カラム常時表示・絞り込みバッジのトグル化・Tagのホバー効果不備）
- [[2026-09-15-phase3-step3-tags]] — フェーズ3 ステップ3（タグシステム）。タグ付与・削除のAdmin SDK APIルート、`TagEditModal`共通部品、`.mjs`スクリプトのAPIルートからの再利用
- [[2026-09-15-phase3-step4-playlists-search]] — フェーズ3 ステップ4（再生リストを探す本実装）。`/games`と同じ簡易実装方針、`PlaylistCardGrid`のタグ表示をgameNameの仮置きから実データに置き換え
- [[2026-09-15-phase3-step5-finish]] — フェーズ3 ステップ5（仕上げ）。768pxで再生リスト詳細ページがオーバーフローする不具合を発見・修正（グリッドアイテムのmin-w-0欠落）、タグ絞り込みパネルの本番E2E確認。フェーズ3完了
- [[2026-09-20-phase4.5-step7-partial]] — フェーズ4.5 ステップ7（仕上げ）。/history・/settingsの3幅/aria確認、stg棚卸し（ルール一致・インデックス差分1件・Auth一致・マスタデータほぼ一致）、stg/本番デプロイ実施。本番向けgcloud操作はauto modeにブロックされユーザーが自ら実行。フェーズ4.5完了

## Entities
- [[proxy]] — proxy.ts（旧middleware.ts、Next.js 16のproxy規約対応）

## Concepts
- [[firestoreセキュリティルール方針]] — ロール判定・コレクション別ポリシー
- [[依存バージョン固定方針]] — package.jsonのバージョン記法方針
- [[マスタデータ投入方針]] — 投入対象の規模・ID採番ルール・Admin SDK必須の理由
- [[ステージング環境運用方針]] — 設定は都度同期・データ検証はフェーズ4まで後回しの方針。2026-09-20棚卸しで方針どおりの一致を確認（インデックス差分1件のみ）
- [[デザイントークン運用方針]] — 仕様書トークン→`@theme`の1対1対応、`@utility`のグラデーション面、1px半透明白の枠線、奥行きの3段階、刺し色の原則（2色目を足さない）、セレクトはSelectMenu、ヘッドレスUI方針
- [[react-hooksのset-state-in-effect対応]] — 購読系はコールバック/クリーンアップで、「propが変わったらstateを調整する」は描画中に直接setState、導出値はstate化しない
- [[CSSグリッドのmin-width対策]] — `fr`単位でもグリッドアイテムのmin-width初期値はauto。直下の子要素にmin-w-0が無いと内容の最小幅でトラックがオーバーフローする
- [[auto modeの本番操作制限]] — 本番プロジェクトへのgcloud/deploy操作（読み取り専用含む）はauto modeの許可分類器にブロックされ、Claude自身では解除もできない。本番操作はユーザーが直接実行する運用にする

## Analyses
（まだページなし）

---
このindexはIngest / Query操作のたびに更新すること。
