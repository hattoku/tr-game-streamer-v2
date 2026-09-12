---
title: フェーズ2.5 ステップ0・1 — 仕様書の穴埋めとスタイリング基盤
type: source
date: 2026-09-11
updated: 2026-09-11
commit: 4f1f54f
---

# フェーズ2.5 ステップ0・1 — 仕様書の穴埋めとスタイリング基盤

[[2026-09-11-phase2.5-design-plan]] のステップ0（仕様書の穴埋め）とステップ1
（Tailwind 導入・UI部品）を実施した。

## ユーザー決定: 完成品UIライブラリは使わない

HeroUI / Mantine を全面採用する案と比較し、**Tailwind でトークンどおりに自作 ＋
挙動は Radix UI Primitives（ヘッドレス）** に決定。理由と管理画面での再検討方針は
計画書 §2.1 参照。

## ステップ0: 仕様書の更新（コードより先に）

| 仕様書 | 版 | 変更 |
|---|---|---|
| 共通 デザイントークン仕様書 | v1.1 → v1.2 | §5.1 に視聴中以外のアクティブチップ色、§10 入力要素、§11 ホバー/フォーカス/無効、§12 トースト色、§13 モーダル/ドロワー/ドロップダウン、§14 ヘッダー高さ・ナビ・フッター、§15 未読ドット/件数バッジ/タブ を追加。目次が §9 までで止まっていたのを実態に合わせた |
| 共通 uiコンポーネント フロント 仕様書 | v1.4（ヘッダ表記）→ v1.6 | ヘッダー高さ 60/52/30px、トースト位置を上部中央に確定、種別色をトークン仕様書 §12 に揃えた。ヘッダ表記の版番号が改訂履歴（v1.5）とずれていたのも修正 |
| 動画プレーヤー 仕様書 | v1.3 → v1.4 | 進捗バー色（#FF0000/#C8C8C8 → トークン #e03030/#333333）、再生中ハイライト（「薄いグレーまたは青」→ #1c1c1c）をトークン仕様書に統一 |

## ステップ1: スタイリング基盤

### 導入パッケージ（すべてキャレット無し固定、[[依存バージョン固定方針]]）

| パッケージ | 版 | 用途 |
|---|---|---|
| tailwindcss / @tailwindcss/postcss | 4.3.3 | devDependencies。`postcss.config.mjs` で読み込み |
| @radix-ui/react-dialog | 1.1.23 | モーダル・ドロワー |
| @radix-ui/react-dropdown-menu | 2.1.24 | ユーザーメニュー・ステータス変更 |
| @radix-ui/react-tabs | 1.1.21 | フィルタタブ |
| @radix-ui/react-toast | 1.2.23 | トースト |

### `app/globals.css`

- `@import 'tailwindcss'` の後、`@theme` にトークンを CSS 変数で定義。命名は仕様書の
  トークン名に `--` を付けただけ（`color-bg-base` → `--color-bg-base` → `bg-bg-base`）。
  詳細は [[デザイントークン運用方針]]。
- `--text-*` を仕様書の 8 段階（10〜16px + score 26px）で**上書き**した。Tailwind 標準の
  `text-base`（16px）とは値が違うので注意（`text-base` は 13px）。
- `@layer base` に body の背景・フォント・`:focus-visible`・`button:disabled`・
  `accent-color` を置いた。`@layer components` に `.skeleton`。
- アニメーション（fade / slide-in-right、200ms）も `@theme` の `--animate-*` で定義。

### `components/ui/`

| ファイル | 内容 | 根拠 |
|---|---|---|
| cn.ts | className 結合（clsx 不使用） | — |
| icons.tsx | インライン SVG 17 種（Material Symbols 名に合わせた命名） | UI仕様書 §8.3 |
| Logo.tsx | 赤四角＋三角＋「プレミテ」。`compact` でシアターモード用縮小 | トークン §8.2 |
| Button.tsx | primary / secondary / rakuten × md / sm / full。`loading` でスピナー。LinkButton / ExternalLinkButton | トークン §4, §11 |
| Card.tsx | Card / CardDivider / CardTitle | トークン §6 |
| Chip.tsx | StatusChip（視聴中のみ緑＋ドット）、WatchStatus 型とラベル | トークン §5.1、マイリスト §5.2 |
| Badge.tsx | TrendingBadge / NewBadge / UnreadDot / CountBadge | トークン §5.2, §15 |
| Tag.tsx | 下線テキストリンク型 | トークン §7 |
| ProgressBar.tsx | 2px、role=progressbar | トークン §6.4 |
| Skeleton.tsx / Spinner.tsx | シマー付きスケルトン、SVG スピナー | トークン §9 |
| EmptyState.tsx | アイコン・見出し・補足・アクション | UI仕様書 §8 |
| Input.tsx | Input / Textarea / Select / PasswordInput / Field / Checkbox | トークン §10 |
| Modal.tsx | Radix Dialog ラッパー | トークン §13.1、UI仕様書 §5 |
| Toast.tsx | Radix Toast ＋ `ToastProvider` / `useToast()` | UI仕様書 §6、トークン §12 |
| Tabs.tsx | Radix Tabs ラッパー（件数バッジ付きトリガー） | トークン §15.3 |
| DropdownMenu.tsx | Radix DropdownMenu ラッパー | トークン §13.3 |
| index.ts | 再エクスポート（`@/components/ui`） | — |

`app/layout.tsx` に `globals.css` の import と `ToastProvider`、`metadata`（title/description）を追加。
ヘッダー・フッターは次のステップ2で組み込む。

### 動作確認

- `npx tsc --noEmit` エラーなし、`npm run build`（Turbopack）成功。
- ビルド後 CSS に `--color-bg-base` / `.bg-bg-card` / `.text-md` / `.shadow-elevated` /
  `.animate-fade-in` / `.border-l-toast-success` / `.skeleton` / `data-[state=active]` 変種が
  生成されていることを grep で確認。部品はまだページから使われていないため、見た目の確認は
  ステップ2以降で実ページに当てながら行う。

## 関連
- [[2026-09-11-phase2.5-design-plan]]
- [[デザイントークン運用方針]]
- [[依存バージョン固定方針]]
