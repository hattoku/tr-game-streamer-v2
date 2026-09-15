---
title: フェーズ3 ステップ1 — レビュー・スコアリング機能
type: source
date: 2026-09-13
updated: 2026-09-14
commit: bf11c1c
---

# フェーズ3 ステップ1 — レビュー・スコアリング機能

フェーズ2.5完了後、フェーズ3（全フェーズ共通機能）の最初のステップ。星評価・視聴ステータス・
コメント投稿と、信頼度加重平均による再生リストスコアを実装した。

## 計画時の発見

`ページ 再生リスト レビュー投稿機能 仕様書.md`・`共通 信頼度スコアリングシステム 仕様書.md`の
実装に着手する前に、`firestore.rules`・`firestore.indexes.json`が既にフェーズ1（2026-09-09）時点で
`reviews`・`helpful_votes`・`tags`・`workflows`・`games`・`genres`・`themes`を含む29コレクション
全てに対して設計・デプロイ済みであることが判明した。ステップ1はUI/APIの実装のみで完結し、
ルール変更・デプロイは不要だった。

また、ロードマップ上「レビュー・スコアリング」「タグシステム」の2項目だが、その前提として
`/games`・`/playlists`の探すページ本実装が未着手であることも判明し、
**レビュー→ゲームタイトル詳細→タグシステム→探すページ本実装**の順で進めることをユーザーと合意
（フェーズ3全体の計画。[[2026-09-14-phase3-step2-games]]参照）。

## アーキテクチャ: 信頼度スコアはAdmin SDK側で算出

`trustScore`（W = (D+H+G)×C）のうちジャンル専門性`G`の算出には「投稿者のマイリスト登録済み
再生リストのゲームジャンル集計」という他ユーザーコレクション横断のクエリが必要で、クライアントから
信頼できる形で算出させるのは無理がある。`app/api/playlists/register/route.ts`と同じ
Admin SDK APIルートパターンで実装した。

- `app/api/reviews/upsert/route.ts`: `requireUser`（`lib/api-auth.ts`に新設。既存`requireAdmin`は
  owner/operator限定なので、署名検証のみ行う一般ユーザー向け関数を追加）で認証。star/watchStatus/
  comment等を受け取り、D/H/G/C/trustScoreを算出して`reviews`をupsertし、`playlists.score`
  （信頼度加重平均）と`reviewCount`を`lib/review-score.ts`の`recalculatePlaylistScore`で再計算する。
  レビュー投稿時のマイリスト自動登録（仕様書「マイリスト登録」節）も同じバッチで行う
  （`reviews.watchStatus`の`"reviewing"`は`mylist.watchStatus`に対応する値が無いため、未登録時のみ
  既定値`"want_to_watch"`で登録する設計）。
- `app/api/reviews/helpful/route.ts`: 「参考になった」の押下・取り消し。`helpful_votes`の作成・削除と
  `reviews.helpfulCount`・`trustScore`の再計算、`playlists.score`の再計算をまとめて行う。
- `app/api/reviews/validate-comment/route.ts`: NGワード判定専用の軽量エンドポイント（下記参照）。

## NGワードはサーバー側のみで判定

`firestore.rules`は`ng_words`を管理者以外に非公開としている（回避策を助長しないため、フェーズ1設計時の
方針）。当初計画では「クライアント側でリアルタイムチェック」を想定していたが、このルールに反するため
実装時に修正: 入力中のリアルタイム判定もデバウンス付きで`app/api/reviews/validate-comment`を呼ぶ方式に
変更した。最終送信時は`app/api/reviews/upsert`側でも再検証する。

初期データはスパム・勧誘系の安全な語句12件のみ（`scripts/data/ng-words.mjs`）を
`scripts/seed-ng-words.mjs`で投入（本番・ステージング済み）。差別語・侮蔑語・暴力表現等は、
線引きが運営者の判断に委ねられるべき領域のためリポジトリでは列挙せず、運営者がFirebaseコンソールから
直接`ng_words`へ追加する運用とした（ユーザー合意）。

## 実装中に見つかったスキーマギャップ・仕様の食い違い

- **投稿者の表示名・アイコン**（HANDOFF未解決事項1）: `users`は本人・管理者以外読めないルールのため、
  レビュー一覧で投稿者名を表示できない問題が未解決のまま残っていた。`reviews`に
  `userDisplayName`/`userProfileImageUrl`を投稿・更新時点のスナップショットとして追加することで解決
  （`channelName`等、他の非正規化フィールドと同じ設計）。Firestore データモデル設計書 v1.11。
  投稿者名から公開プロフィールページへのリンクは、そのページ自体が仕様として存在しないため作らなかった
  （プレーンテキスト表示のみ）。
- **`commentScore`の記載不一致**: `Firestore データモデル設計書.md`3.9節のコメントに「0.2/0.5/1.0」と
  あったが、`共通 信頼度スコアリングシステム仕様書.md`4.1節の計算式は「あり:1.0/なし:0.5」の2値のみ。
  後者を正としてDB設計書側の誤記を修正（v1.11）。
- **ネタバレ非表示設定の永続化**: ログイン済みユーザー分の保存先が仕様書になかったため、
  `users.hideSpoilerReviews`（boolean、既定true）を追加。`firestore.rules`のusers更新許可フィールドにも
  追加し、本番・ステージング双方へデプロイ済み。
- **`users.reviewCount`/`helpfulReceivedCount`**: DB設計書に既存定義されていたが誰も更新していなかった
  集計フィールド。レビュー投稿・削除・参考になった操作に連動させた。

## 信頼度スコアが0になる不具合と対応

実機確認で、視聴記録（プレーヤーでの再生）・参考になった・ジャンル専門性が全て0のレビューは
`W = (D+H+G)×C = 0`になり、加重平均の計算上そのレビューが実質存在しないのと同じになる
（★評価してもスコアが「評価なし」のまま）ことが判明。仕様書の計算例は全てD>0の前提で書かれており、
D=0の完全なゼロケースは想定されていなかったとみられる。

ユーザーと相談し、**Dが0のときのみ最低値0.01を保証する**（H・Gはそのまま）方針で対応
（共通 信頼度スコアリングシステム仕様書 v1.2 §3.1「D=0の下限」）。`app/api/reviews/upsert/route.ts`の
`MIN_WATCH_DEPTH`定数。

## `playlists.mylistCount`が機能していないことが判明（未解決のまま持ち越し）

`AddToMylistButton`はクライアントSDKから`mylist`を直接読み書きするが、`playlists.mylistCount`を
増減させる処理がどこにも無い（`firestore.rules`のplaylists更新許可フィールドにも含まれていない）。
このステップのスコープ外と判断し、HANDOFF未解決事項11として記録した。

## その他の実装

- `components/ui/StarRating.tsx`: ★0.5刻み、ホバープレビュー、同値クリックでキャンセル、
  読み取り専用時は信頼度スコアリング仕様書§6.2のしきい値（0.25/0.75）で半星表示する共通部品。
  `PlaylistInfoCard`の星表示もこれに置き換えた。
- `components/reviews/`: `ReviewForm`（星評価・視聴ステータスは即時保存、コメントは明示的な
  「投稿する」で保存）・`ReviewList`（件数・ネタバレ折りたたみ・星評価フィルター・参考になった・
  カードメニュー）・`ReportModal`（`workflows`へのレコード作成のみ、処理は完全に先送り）・
  `ReviewSection`（Form+Listをまとめ、一覧の「編集する」からフォームへスクロール）。
- レビュー投稿セクションはPC版が左カラム（ヒーロー直下）、モバイル版が動画リスト直後という配置差が
  あるため、`PlaylistInfoCard`と同じ「2箇所にレンダリングし片方をCSSで隠す」パターンで配置。

## react-hooks/set-state-in-effect の修正

このステップで新規に書いた複数のコンポーネント（`ReviewForm`・`ReviewList`）で
`react-hooks/set-state-in-effect`の指摘が繰り返し発生した。対応パターンは[[react-hooksのset-state-in-effect対応]]
にまとめた（以降のステップでも同じパターンを再利用）。

## 動作確認

`npm run lint`/`tsc --noEmit`/`npm run build`成功。ブラウザでの実機確認はユーザーが実施し、
★評価がスコアに反映されない不具合（上記）を発見・報告してもらい、その場で修正した。

## 関連
- [[2026-09-14-phase3-step2-games]]
- [[2026-09-15-phase3-step3-tags]]
- [[react-hooksのset-state-in-effect対応]]
- [[2026-09-09-firestore-security-rules]]（このステップで新規ルール設計が不要だった理由）
