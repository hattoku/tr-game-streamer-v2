---
title: フェーズ6 ステップ4-2 — まとめを探す・発見導線
type: source
date: 2026-10-12
updated: 2026-10-12
---

# フェーズ6 ステップ4-2 — まとめを探す・発見導線

[[2026-10-08-phase6-step4-1-collections]] の続き。`/collections`（ComingSoon だった）を本実装し、まとめを見つける導線を足した。

## ユーザー決定事項（着手時）

- 並び順は**新着順のみ**。保存数順（§6.2）は保存機能（4-3）で追加（4-2時点では保存数が全件0のため）
- カードは **PC 2列・スマホ 1列**
- 発見導線は3つとも実装: 再生リスト詳細「この再生リストを含むまとめ」、TOP「新着のまとめ」、`/collections` の見出し横に「自分のまとめ」「新しいまとめを作る」
- TOP・再生リスト詳細の導線は、まとめ仕様書 §7 が参照する各仕様書に定義が無かったため、TOP仕様書 §7.5・再生リスト詳細仕様書に新設した

## 実装内容

- `app/(main)/collections/page.tsx`: 公開まとめ全件（`fetchPublicCollections`）と公開再生リスト（サムネイル用）をクライアント取得。
  キーワードはタイトル・説明文の部分一致、20件ページング（`/channels` と同じ「描画中にsetStateでページを1に戻す」パターン）。
  空状態は3種（公開0件・検索0件・取得失敗）。
- `components/collections/ContainingCollectionsCard.tsx`: `visibility=='public'` ＋ `playlistIds array-contains` で取得し最大5件。
  再生リスト詳細の右カラム最後（ゲーム情報の下）。取得結果の上書きレースを `cancelled` フラグで防ぐ。
- `components/top/NewCollectionsSection.tsx`: TOPで公開まとめを別途取得（他セクションの表示は待たせない）、最大10件のカルーセル。
  サムネイルはTOPが取得済みの公開再生リストから引く。
- `CollectionCard`: `className` prop、説明文2行省略、日付に「作成」、サムネイルは3列固定、「全X件」は保存数と並べて下段に常時表示。
  サムネイル側のリンクはタイトルと同じ遷移先のため `tabIndex={-1}`＋`aria-hidden`。

## 判明した事実

- **等価条件＋`array-contains`（orderBy なし）は複合インデックス無しで動く**。Firestore が単一フィールドインデックスをマージする。
  stg で `firestore.indexes.json` を変えずに動作確認した。orderBy を足すと複合インデックスが必要になるので、ソートはクライアント側で行う。

## dev-orchestratorレビュー（spec・design、両方の結果を受領して統合）

重大指摘なし。対応: `/collections` の取得失敗でスケルトンが出続ける（`.catch` と取得失敗用の空状態）、コメント・仕様書の「定義が無い」記述が古い、
空状態の仕様書未記載、TOP仕様書の改訂履歴の順序、`ContainingCollectionsCard` の再取得レース、カード内の同一hrefリンク重複、
サムネイル幅が件数でばらつく。

## 動作確認

lint / tsc 成功。stg＋Playwright で一覧・キーワード一致/0件・ログイン時の導線（未ログインは非表示）、再生リスト詳細の新カード、
TOPの新着のまとめを確認。390/768/1440px で横スクロール無し。ユーザーの dev サーバー稼働中のため `npm run build` は未実施
（同時に走らせると dev サーバーが壊れる。[[2026-10-08-phase6-step4-1-collections]] のハマりどころ参照）。
