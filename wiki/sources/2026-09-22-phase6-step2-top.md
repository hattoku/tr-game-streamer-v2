---
title: フェーズ6 ステップ2 — TOP本実装
type: source
date: 2026-09-22
updated: 2026-09-22
---

# フェーズ6 ステップ2 — TOP本実装

フェーズ2.5で置いた最小版TOP（「新着の再生リスト」グリッドのみ）を、`ページ top 仕様書.md`
（v1.3）に基づく本実装に差し替えた。未ログイン時（ヒーロー＋注目＋タグピックアップ）／
ログイン済み時（マイリスト＋注目＋新着＋タグピックアップ）のセクション構成。
実装完了後、`dev-orchestrator`（`spec-conformance-reviewer`・`design-consistency-reviewer`を並列委任）
にレビューを依頼し、指摘を全件対応した。

## ユーザー決定事項（着手前）

- 注目セクションのジャンルタブは「総合」＋対象（スコア付き再生リスト）があるジャンルのみ表示
  （ジャンルマスタ9件に対しレビュー付き再生リストがまだ少ないため）
- ヒーロー検索バーのプレースホルダーは`/playlists`の実際の検索対象（ゲームタイトル・チャンネル名）に
  揃える（TOP仕様書側の文言を変更、v1.3）
- 「初めての方へ →」（`/about`、フェーズ7まで404）は置く（フッターの前例に合わせる）

## 実装

- **データ取得**: 公開`playlists`全件（`fetchPublicPlaylists`）＋`tags`＋`genres`を1回だけ取得し、
  注目／新着／タグ各セクションへ配列で渡す（Firestore読み取りはページ全体で実質1回）。
  マイリストセクションのみログイン後に別途`fetchMylistEntries`（`lib/mylist-entries.ts`、新規）。
- **カード共通化**: `PlaylistCardGrid`内にインラインだったカードを`PlaylistCard`として切り出し、
  TOPのカルーセルでも同じ部品を使う（`components/playlists/PlaylistGrid.tsx`）。
  `PlaylistSummary`に`gameGenreIds`フィールドを追加（ジャンルタブ絞り込み用）。
- **`/mylist`のリファクタ**: 元々`/mylist`ページ内にあった`loadEntries`ロジックを
  `lib/mylist-entries.ts`の`fetchMylistEntries`に切り出し、TOPのマイリストセクションと共用
  （挙動は変更なし）。
- **カルーセル**: `components/ui/Carousel.tsx`（ネイティブ横スクロール＋`scroll-snap`、
  モバイルは左右余白へブリード）を新設。デザイントークン仕様書に先に§6.7として定義してから実装。
  送りボタン（‹ ›）の状態管理は`components/top/useCarouselNav.ts`に、ヘッダー行（見出し＋送りボタン＋
  「すべて見る →」）は`components/top/SectionHeaderRow.tsx`に共通化し、`TopSection`（カルーセル系3
  セクション用）と`MylistSection`（空状態・読み込み中の分岐を持つため`TopSection`は使わない）の
  両方から使う。
- **`/playlists`のクエリパラメータ対応**: TOPの「すべて見る」・検索バーからの流入用に
  `?q=`（キーワード）・`?sort=`（ソート）・`?tag=`（タグ絞り込み）を初回表示時のみ読み込む
  （`/games`の`?tag=`と同じ遅延初期化パターン）。

## レビュー指摘と対応（dev-orchestrator経由）

`spec-conformance-reviewer`・`design-consistency-reviewer`を並列委任。両者から独立に指摘された
「マイリストセクションだけPC送りボタンが無い」は実際に仕様（§6.7が4セクション共通と明記）からの
逸脱だった。対応した指摘:

1. **`FeaturedSection`のジャンルタブがモバイルで横スクロールでなく折り返しになるバグ**:
   `TabsList`の`className`は外側ラッパー`div`にしか効かず、実際にタブを並べる内側の
   `RadixTabs.List`には届いていなかった。`TabsList`に`scrollable`真偽値propを追加し、
   `flex-wrap`/`flex-nowrap`を排他的に出し分ける方式に変更（`className`で両方渡して後勝ちに
   賭ける実装はしない。[[デザイントークン運用方針]]に教訓を追記）。
2. **`TopMylistCard`の子エリア`ProgressBar`が`size="sm"`（2px）になっていた**: 仕様書§6.4・
   姉妹コンポーネント`MylistCard`と同じ`size="md"`（3px）に修正。
3. **マイリストセクションだけPC送りボタンが無い**: `useCarouselNav`・`SectionHeaderRow`に
   共通化し、他3セクションと揃えた（空状態・読み込み中は送りボタンを出さない）。
4. **ヒーロー検索バーに「検索ボタンクリック」に相当する要素が無い**（仕様§4.3は
   「Enterキー or 検索ボタンクリック」）: 右端の検索アイコンをクリック不可の装飾から
   `type="submit"`の実ボタンに変更。
5. **セクション見出しがモバイルでのみ`text-xl`（15px）に縮小されていた**: 他ページの
   `SectionHeading`はすべて既定の18px固定で、この2箇所だけモバイル専用の上書きがあった。
   上書きを削除して統一。
6. **`HeroSection`の`Card`パディング上書き**（`p-[18px]`と`py-6 md:py-8`の同時指定）が
   `cn`のクラス競合リスクを持っていた: `Card flush`にして呼び出し側で全パディングを明示する
   方式に変更。
7. 仕様書側の軽微な指摘（TOP仕様書の関連ドキュメント欄に「再生リストを探す仕様書」が
   未掲載、デザイントークン仕様書§6.7の「JSでのページ送りは行わない」という文言が
   直後の送りボタン仕様と字面上矛盾）も修正。

## 動作確認

`npm run lint` / `npx tsc --noEmit` / `npm run build`成功（レビュー対応の前後両方で実施）。
ローカル`npm run dev`（stg）＋Playwright MCPで、未ログイン（ヒーロー・検索送信・初めての方へ）、
一般ユーザー（マイリストセクションの空状態・視聴中カード・完走+新着なしの除外、新着セクション、
実際にレビュー投稿してスコアを発生させた上での注目セクション出現・ジャンルタブ絞り込み動作）、
`/playlists?q=`・`?sort=`・`?tag=`のクエリパラメータ反映、カルーセル送りボタンの有効/無効切り替え、
`/mylist`のリグレッション無し、1440/768/390px幅でのレイアウトを確認。確認用に投稿したレビュー・
マイリスト登録はすべて削除しstgのデータを元の状態に戻した。

## 関連
- [[デザイントークン運用方針]]
- [[2026-09-22-phase6-plan-and-step1-channels]]
