---
title: 右上のユーザーメニューを整理
type: source
date: 2026-11-16
updated: 2026-11-16
commit: ba7de9f
---

# 右上のユーザーメニューを整理

PR #48（2026-11-16）。Notion チケット「右上のメニューを整理する」。仕様は 共通 uiコンポーネント フロント 仕様書 v2.5 §2.6。

## 変更

- `components/layout/UserDropdown.tsx`: ドロップダウンのまとまりを組み替えた
  - ユーザー名・メール（表示専用）の直下に「プロフィール」「設定」（区切り線なしで1つのまとまり）
  - 「マイリスト」「視聴履歴」。スマホ（767px以下）ではマイリストを出さない（ボトムタブにあるため）
  - 「サポート」の見出しの下に「提案履歴」「お問い合わせ履歴」（未読数はそのまま。[[2026-11-14-notification-split-inquiry-review]]）
  - 管理画面（管理者のみ）、ログアウトは従来どおり
- `components/layout/useIsMobile.ts`（新規）: `useSyncExternalStore` ＋ `matchMedia('(max-width: 767px)')`。サーバー描画と最初の描画は false（PC 扱い）
- `components/ui/DropdownMenu.tsx`: `DropdownMenuGroup`（Radix の Group）を export
- E2E: `e2e/user-menu.spec.ts`（desktop・mobile で並びとサポートのまとまり、設定への遷移）

## ユーザー決定（Notion チケット本文）

- ユーザー名とメールの所は押しても何も起きないので、プロフィールと設定をそこにまとめる
- スマホではボトムタブにマイリストがあるのでメニューには不要
- 提案履歴とお問い合わせ履歴は「サポート」でまとめる

## Claude が決めた解釈

- ユーザー名の行は押せないまま、すぐ下にプロフィールを置いた（名前の行自体をプロフィールへのリンクにする案もある）
- スマホでも「視聴履歴」は残した（チケットはマイリストにだけ触れていたため）

## ハマりどころ

- メニュー項目を `hidden md:flex` で隠すと、Radix のキーボード操作が見えない項目に止まる恐れがあるため、項目そのものを `useIsMobile` で出し分けた
- 同じ日の PR #49 も UI仕様書を v2.5 にしていた。#48 を先に入れ、#49 側を v2.6 に上げる
