---
title: フェーズ2.5 ステップ4.5 — デザイン方針の見直し（A. クリムゾン採用、トークン仕様書 v2.0）
type: source
date: 2026-09-12
updated: 2026-09-12
commit: （未コミット）
---

# フェーズ2.5 ステップ4.5 — デザイン方針の見直し（A. クリムゾン採用、トークン仕様書 v2.0）

[[2026-09-11-phase2.5-design-plan]] のステップ3（再生リスト詳細）まで終えた時点で、ユーザーから
「ボタンがただの文字リンクに見える」「枠がただの枠でカードになっていない」「カードがフラットすぎる」
「そもそも枠や線のガイドラインが無いのでは。ゲームというエンタメを扱うのでもう少しリッチにしたい」との
指摘があり、機能追加（ステップ5〜7）を止めてデザイン方針を見直した。

## 1. 指摘の切り分け

| 指摘 | 原因 | 対応 |
|---|---|---|
| `/playlists/new` `/mylist` のボタン・枠・プルダウン（文字が背景とかぶる）・タブ | これらのページは **まだデザイン未適用**（フェーズ2のノースタイル。Tailwind クラス0、素の `<select>`） | ステップ5・7で解消。素の select はブラウザのダーク配色と混ざるため、v2.0 で「セレクトはブラウザ標準を使わない」と明文化 |
| `/playlists` のカードがフラット、ヘッダーがつまらない | **仕様どおり作った結果**。トークン仕様書 v1 §1「UIクロームは背景に溶け込む」＋刺し色厳格限定＋ `#141414` on `#0f0f0f` に `0.5px #222` 枠 | デザインシステムそのものの問題と判断し、コンセプトを改訂 |
| 「全17話」の文言 | 動画プレーヤー仕様書の動画リスト見出し「全XX話」をカードに流用していた。更新中の再生リストに「全」は不適切 | 「N話」に変更（プレーヤー仕様書 v1.5、探す仕様書 v1.6、トークン仕様書 §6.5） |

なぜこのタイミングで止めたか: 残りのステップ5〜7はすべて Card・Button・Tabs の上に載るため、共通層の方針を
先に固めないと4ページ分の手戻りになる。また、9/12 の1日で UI仕様書が v1.6→v1.15、トークン仕様書が
v1.2→v1.6 と改訂されており、「実装→実機で見る→仕様書を直す」の周回が起きていた（仕様書がモックアップ起点で
実機検証を経ていなかった）。

## 2. 方向性の決定（モックアップ4案 → A. クリムゾン）

黒ベース＋ブランド赤を共通にし、「2色目に何を足すか」を軸に4案を Claude Design のキャンバスで描いて比較した。

| 案 | 2色目 | 結果 |
|---|---|---|
| **A. クリムゾン** | なし（赤と白だけ。演出は奥行きのみ） | **採用**（ユーザー決定 2026-09-12） |
| B. エンバー | 琥珀（★スコア色を昇格） | 不採用。スコアとアクティブ表示の区別が弱まる |
| C. ネオン | バイオレット＋シアン | 不採用。4色になり規律が必要、長時間視聴で疲れる |
| D. ティール | 青緑（視聴中と統合） | 不採用。視聴中の特別感が薄れる |

ユーザーは当初 B（赤の解禁）を選び「黒と赤にこだわらない、相性の良い色は足してよい」としたが、
モックアップを見て A を選択。**赤の用途拡大（ロゴのみ→プライマリボタン・進捗・未読・再生中）は A にも含まれる**。

- キャンバス: https://claude.ai/code/artifact/f0cf5e60-219c-4a93-9089-c5bfbe42c2bd（ページ1 = 採用案 A の PC/モバイル、ページ2 = 不採用案の記録）
- 作業ファイル: `document/design/phase2.5-direction-mockups/`（`Main.dc.html` = A、`Mobile.dc.html`、`Ember/Neon/Teal.dc.html`、`canvas.json`、
  生成スクリプト `gen-directions.mjs`）。キャンバスを更新するときは `.dc.html` を編集（または生成スクリプトを直して再生成）し、
  `/design` スキルで再シード・再公開する。

## 2.1 実ブラウザでの確認手段（今回確立）

「ブラウザ自動化がこの環境に無い」としていたが、Chrome の DevTools Protocol を Node の標準 WebSocket で叩けば
データ読み込み後のスクリーンショットが撮れる。`scripts/dev/screenshot.mjs` に置いた（依存追加なし）。

```
node scripts/dev/screenshot.mjs <url> <out.png> [width] [height] [waitMs] [mobile:0|1] [evalJs]
例: node scripts/dev/screenshot.mjs http://localhost:3000/playlists out.png 1440 1000 9000
    node scripts/dev/screenshot.mjs http://localhost:3000/playlists out-m.png 390 1300 9000 1   （モバイル幅・タッチ）
```

`waitMs` は Firestore の読み込み待ち。ヘッドレス Chrome の `--screenshot` だけでは読み込み前のスケルトンしか撮れない。
ユーザーの `npm run dev`（3000番）が動いていればそのまま使える（別ポートで二重起動はできない）。ステップ7・8の目視確認に使う。

## 3. 仕様書の改訂

**共通 デザイントークン仕様書 v2.0**（`document/specification/common/`）。要点:

- §1 コンセプト: 「UIクロームは面と奥行きを持って立つ」。3原則 = 2色目を足さない／赤を主要アクションと進行へ拡大／奥行きは §16 で作る。
- §2.2 境界線: `0.5px` 実線を廃止し **1px の半透明白**（`rgba(255,255,255,α)`）に統一。0.5px は高DPI以外で描画されず面の境界が消えていた。
  旧トークンの対応: `border-subtle`→`border-divider`、`border-default`→`border-card`、`border-strong`→`border-control`。
- §4 ボタン: プライマリ = 赤グラデーション面＋影＋上端ハイライト。セカンダリ = グレー面＋枠＋影、**トグルON状態**を追加。**ゴーストボタン（§4.4）**を新設（削除・キャンセル）。横並びのボタン群には縦線セパレーター。
- §6 カード: グラデーション面＋1px枠＋影、ホバーで 3px 浮き上がり。§6.5 サムネイル（下部オーバーレイ・話数「N話」・ホバー再生ボタン）、§6.6 子エリアを新設。
- §7 タグ: 下線テキスト → ピル。§10 入力: 内側の影、フォーカスは白枠＋リング、セレクトはドロップダウンで描画。
- §13 浮遊面: グラデーション＋影を強く。ドロップダウンの現在値は選択面＋チェック。
- §14 ヘッダー: 上端ハイライト、ユーザーエリアをピルに。ボトムタブバーに面と影。§15 件数バッジをピルに。
- **§16 奥行き・演出（新設）**: 面の3段階（フラット／カード／浮遊面）と影トークン、動き、やらないこと（グロー禁止・2色目禁止・強いグラデーション禁止・サムネイルより目立つクローム禁止）。

関連: 動画プレーヤー仕様書 v1.5（「N話」）、再生リストを探す仕様書 v1.6（カードに話数とホバー再生ボタン）。

## 4. コードへの反映

- `app/globals.css`: v2.0 トークン。グラデーションは `@utility bg-gradient-card / -elevated / -primary / -secondary / -secondary-hover / bg-header / bg-gradient-bottom-tabs / bg-thumb-overlay`。影は `--shadow-card / -card-hover / -elevated / -control / -primary / -logo / -bottom-tabs / -focus-ring`、`--inset-shadow-highlight / -highlight-strong / -input`。`--text-heading: 18px`。
- `components/ui/`: Card（`CardChildArea`・`SectionHeading` 追加）、Button（`ghost` variant・`active` prop）、Chip、Tabs（`trailing` でソート等を右端へ）、Badge（`PlayingBadge`・`CountLabel` 追加、`CountBadge` ピル化）、Tag（ピル・`emphasis`）、Input（`Select` を削除、`INPUT_CLASS` を公開）、DropdownMenu（`DropdownMenuRadioGroup/RadioItem`・**`SelectMenu`** 追加）、Modal、Toast、Logo、icons（Star/Users/Comment/Reverse/Trash/ExternalLink）。
- `components/layout/`: Header（`bg-header`）、UserDropdown（ピル）、BottomTabBar（面＋影）、Footer/MobileMenu/SearchTabs/AuthLayout/TestModeWidget（トークン置換）、ComingSoon（`SectionHeading`）。
- ページ: `PlaylistGrid`（探す仕様書 §3.3 の構成に寄せた: スコア/マイリスト数/レビュー数・ゲーム名タグ・「N話」・ホバー再生ボタン）、`VideoList`（「N話」・再生中バッジ）、再生リスト詳細（ヒーローの角丸12px＋影・赤い再生ボタン・シアターボタンをトグルON表示）、`AddToMylistButton`（ステータス変更をラジオ項目＋チェックに）、`loading.tsx`、TOP・一覧の見出し。
- `npx tsc --noEmit` / `npm run build` 成功。旧トークン名（`border-border-subtle` 等）の残りは無し。

## 5. ハマりどころ・判断

- Tailwind v4 でグラデーション面を使い回すため `@utility` を採用（`bg-[image:...]` の任意値は長すぎる）。トグルON時は `bg-none` で `background-image` を消してから `bg-bg-selected` を当てる。
- `inset-shadow-*` と `shadow-*` は v4 で合成されるので同時に指定できる（ボタンの上端ハイライト＋外側の影）。
- 未適用ページ（`/mylist` `/playlists/new` `/notifications` `/login`）は今回触っていない。ステップ5〜7で v2.0 の部品を当てる。

## 関連
- [[2026-09-11-phase2.5-design-plan]]
- [[2026-09-12-playlist-detail-design]]
- [[デザイントークン運用方針]]（v2.0 に合わせて更新）
