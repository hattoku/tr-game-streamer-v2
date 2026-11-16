---
title: ヘッダー等のロゴをアプリアイコンと同じ赤い二重三角に
type: source
date: 2026-11-16
updated: 2026-11-16
---

# ヘッダー等のロゴをアプリアイコンと同じ赤い二重三角に

PR #50（2026-11-16）。Notion チケット「ヘッダーロゴの更新」。仕様は 共通 デザイントークン仕様書 v2.12 §8.2。

## 変更

- `components/ui/Logo.tsx`: CSS で描いていた「ブランド赤の角丸四角＋白い再生三角」を、画像 `public/icons/logo-mark.png`（30px 表示）に置き換え。テキスト「プレミテ」との間隔は 6px
- ロゴはすべて `Logo` コンポーネント経由なので、ヘッダー（`Header.tsx`）・スマホのドロワー（`MobileMenu.tsx`）・フッター（`Footer.tsx`）・認証画面（`AuthLayout.tsx`）に一括で反映
- `scripts/generate-app-icons.mjs`: アプリアイコンの元画像 `document/design/app-icon/premite-icon-source.jpg` から、背景を透過したロゴマーク（96px）を書き出す `renderLogoMark` を追加（`npm run icons:generate`）

## ユーザー決定

- ヘッダーのロゴを、スプラッシュのアイコン（赤い二重三角）に揃える。ロゴを使う場所は漏れなく反映する

## 実装メモ（Claude の判断）

- 置く場所ごとに背景色が違う（#0f0f0f〜#202020）ため、元画像の暗い背景を四角く残さず透過にした。各画素を「背景 #121212 と赤 R=226 を不透明度 a で混ぜた色」とみなし、R から a を求めて背景の分を差し引く。三角の内側の暗い部分も透明になり、光彩は半透明の赤として残る
- 画像は `public/icons/` に置いた。`proxy.ts` の stg パスワードゲートの matcher が `icons/` を対象外にしているため（`public/brand/` などにするとゲート前の画面で画像がリダイレクトされる）
- `next/image` は `unoptimized`（96px の小さな PNG をそのまま配る）、`loading="eager"`。Next.js 16 で `priority` は非推奨（`preload` へ）のため使っていない
- `icons:generate` を再実行すると sharp の版違いでスプラッシュ画像のバイトが変わるため、PR にはロゴマークだけを入れた
- 管理画面のヘッダーはロゴを使っていない（「管理画面 ADMIN」の文字）ので対象外。favicon・PWA アイコン・スプラッシュは既に新デザイン
- トークン `--shadow-logo`・`color-brand-logo` は使われなくなったが残している
- 見た目だけの変更のため E2E は回していない（ローカルで 390px・1280px を目視確認）
