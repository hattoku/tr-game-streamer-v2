---
title: フェーズ6 ステップ3 — 管理画面の最小版
type: source
date: 2026-09-22
updated: 2026-09-22
---

# フェーズ6 ステップ3 — 管理画面の最小版

HANDOFF.mdでは「どの管理操作を最小版に含めるかから決める」と未確定だったため、着手時にユーザーへ
範囲を確認した。

## ユーザー決定事項（着手前）

- **範囲**: A（ダッシュボードへの機能集約）＋ B（審査ワークフローのうち**通報のみ**の一覧・承認/却下）。
  マスタ管理・ユーザー管理・お知らせ・お問い合わせ・モニタリング・操作ログ・提案系ワークフローはスコープ外
  （今後の必要度に応じて別ステップで対応）。
- **権限**: operator/owner共通のみ。オーナー限定操作（STEP2最終承認・強制ステータス変更等）は作らない。

## 実装内容

- `/admin`（ダッシュボード）: 通報の未処理件数サマリー＋「一覧を見る」、新着動画の再取得ボタン
  （`/notifications`下部の「管理者用（暫定）」カードから移設、`app/api/admin/refresh-new-videos/route.ts`
  は変更なしで流用）と直近バッチ実行結果（`batch_logs`）。仕様書が定義する5セクション構成のうち
  データ源・スコープに含まれる2カードのみに縮小。
- `/admin/workflows`（新規）: `workflows`を`type=='review_report'`の等価条件のみでクライアント取得
  （複合インデックス不要、`/channels`等と同じ簡易実装方針）、ステータスタブ（すべて/未処理/承認/却下）・
  20件ページング。
- `/admin/workflows/[workflowId]`（新規）: 申請内容（通報理由・詳細・対象レビュー引用・対象再生リスト
  リンク）、運営メモ編集（1,000文字上限）、承認/却下確認ダイアログ（承認はコメント任意・却下は理由必須）。
  STEP1/STEP2の二段階審査UI・AI運営者・ジャンル別アサインは実装せず、単一ステップの承認/却下とした。
- `app/api/admin/workflows/[workflowId]/route.ts`（新規、PATCH）: `requireAdmin`必須。承認時は対象
  `reviews`ドキュメントをAdmin SDKで物理削除（`app/api/reviews/upsert/route.ts`のDELETEハンドラと同じ
  パターン: reviewCountデクリメント＋`lib/review-score.ts`の`recalculatePlaylistScore`呼び出し）。
  却下時は`workflows`のみ更新（レビューは掲載継続）。STEP1/STEP2を区別しないため、記録は常に
  `step2History`へ追記。
- `app/admin/layout.tsx`・`components/admin/AdminFrame.tsx`（新規）: 認可ガード（未ログイン→`/login`、
  非管理者→`/`）。「共通UIコンポーネント（管理画面）仕様書」が存在しないため、3ペイン構造ではなく
  簡易ヘッダー（ロゴ相当＋ナビ2項目＋ユーザーメニュー）で代替。モバイルはナビをヘッダー2段目に折り返す。
- `app/(auth)/login/page.tsx`: ログイン後リダイレクトをロール別に分岐（管理者→`/admin`、一般→`/`）。
  据え置きだった§5.4の管理者分岐を解消。
- `components/layout/UserDropdown.tsx`: 管理者のみ「管理画面」リンクを追加。
- `lib/report-reasons.ts`（新規）: `components/reviews/ReportModal.tsx`の通報理由定義を切り出し、
  管理画面の通報詳細と共有。

## dev-orchestratorレビュー（spec-conformance-reviewer・design-consistency-reviewer・phase-finish-checker並列委任）

- **spec-conformance-reviewer**（重大度: 高）: 今回のスコープ縮小（STEP1/STEP2廃止・AI運営者廃止・
  ジャンル別アサイン廃止・ダッシュボード5→2セクション）がユーザー承認済みであるにもかかわらず、対応する
  2つの仕様書（管理_ダッシュボード仕様書・管理_審査ワークフロー仕様書）に一切反映されていない指摘を受け、
  両仕様書に「実装注記」節を追加（v1.5・v8.0）。あわせて管理_ダッシュボード仕様書§1.1と
  ページ一覧仕様書.mdに残っていた古い`/admin/login`表記（実装は共通`/login`）を修正（ページ一覧仕様書
  v1.7）。ログイン済み非管理者が`/admin`にアクセスした場合の挙動（TOPへリダイレクト）も仕様書に追記。
- **design-consistency-reviewer**（重大度: 中2件）: ①ダッシュボードの通報件数表示に`text-3xl`
  （デザイントークン仕様書の`@theme`に無いTailwind標準値）を使っていたため`text-score`（26px、仕様書
  スケール内）に修正。②`AdminFrame`のヘッダーナビがモバイル幅で折り返し対策なしだったため、ナビを
  ヘッダー下の2段目（`md:hidden`で出し分け）に移動し390px幅で詰まらない構成に修正。低優先度の参考指摘
  （CardTitle不使用・引用ボックスの独自パターン・`text-input-error`のセマンティクスずれ）はリポジトリ
  全体の既存不統一の踏襲、または実害なしと判断し対応不要とした（`text-input-error`はついでに
  `text-toast-error`へ修正）。
- **phase-finish-checker**: lint/tsc/build成功を再確認。Playwrightのクリック/入力系ツールがセッションに
  無く、ログイン後のインタラクティブフロー（一覧・承認/却下・運営メモ編集）は独立検証できなかった旨の
  報告を受けたが、これは実装者自身が別途Playwrightで確認済み（下記）。

## 動作確認（stg、Playwright）

- 未ログイン・一般ユーザーでの`/admin`直接アクセス→リダイレクト（`/login`・`/`）
- 管理者テストログイン→`/admin`自動遷移、UserDropdownからの導線
- テスト用の通報を作成→一覧表示（タブ・件数）→詳細→承認（対象レビューが物理削除されplaylistの
  スコア・reviewCountが再計算されることを確認）
- 別の通報の却下（理由未入力でボタン非活性、入力後の却下でレビューが掲載継続することを確認）
- 運営メモの編集・保存
- 1440/768/390px幅で横スクロール無し（design-consistency-reviewer指摘対応後のAdminFrame再確認込み）
- `npm run lint` / `npx tsc --noEmit` / `npm run build`成功
- 確認用に作成したデータ（workflows・reviews・mylist）はstgから削除し元の状態に復元

## 環境系の注意事項（今回のコードの問題ではない）

`npx tsc --noEmit`を`next dev`のライブサーバーと並行実行すると、`.next/dev/types/validator.ts`が
まれに型エラーを出すことがあった（実装者環境で1回発生、phase-finish-checkerの独立検証では再現せず）。
`npm run build`内部のTypeScriptチェック（`.next/types`、devサーバーとは別経路）は常に成功しており、
コード側の問題ではないと判断した。

## 関連
- [[2026-09-22-phase6-plan-and-step1-channels]]
- [[2026-09-22-phase6-step2-top]]
- [[デザイントークン運用方針]]
