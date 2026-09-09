---
title: 技術スタックの最新化とバージョン固定
type: source
date: 2026-09-09
updated: 2026-09-09
commit: 98851e0, 5561b06, 488349d
---

# 技術スタックの最新化とバージョン固定

`HANDOFF.md` の未解決事項#2（v1到達点 Next.js 16.1.1/React 19.2.3 と v2雛形 Next.js 14.1.0/React 18の
どちらに揃えるか未決定）への対応。「新規リニューアル開発なので現時点の最新版でいく」方針で決定。

## バージョン変更内容（コミット `98851e0`）

| パッケージ | 旧 | 新 |
|---|---|---|
| next | 14.1.0 | 16.3.4 |
| react / react-dom | ^18 | 19.2.8 |
| firebase | ^10.0.0 | 12.18.0 |
| typescript | ^5 | 7.0.2（ネイティブGo実装版。旧5系とは別系統） |
| @types/node | ^20 | 26.5.0 |
| @types/react / @types/react-dom | ^18 | 19.2.18 / 19.2.7 |

## 対応した副次的な破壊的変更

- **TypeScript 7でES5ターゲットが廃止**（`TS5108: Option 'target=ES5' has been removed`）。
  `tsconfig.json` の `target` を `ES2022` に変更して解消。
- **Next.js 16ビルド時の自動tsconfig調整**: `jsx` が `react-jsx`（automatic runtime）に強制変更され、
  `include` に `.next/dev/types/**/*.ts` が追加された。`next-env.d.ts` も自動更新される
  （`.next/types/routes.d.ts` 等のimportが追加）。これらはNext.jsが管理するファイルなので、
  差分が出ても手で戻さずそのままコミットしてよい。
- **`middleware` ファイル規約がNext.js 16で非推奨**（`⚠ The "middleware" file convention is deprecated.
  Please use "proxy" instead.`）。公式codemod `npx @next/codemod@canary middleware-to-proxy .` で
  `middleware.ts` → `proxy.ts` に自動移行（コミット `488349d`）。ロジック（ステージング環境のBasic認証）は不変。
- `next dev` を実行すると `AGENTS.md` / `CLAUDE.md`（`@AGENTS.md` を読み込むだけの1行ファイル）が
  自動生成される。Next.js 16は破壊的変更が大きく学習データと乖離しているため、コーディングエージェントに
  `node_modules/next/dist/docs/` を読むよう促す内容。**`next dev`が再生成するファイルなので、
  差分から消してもまた復活する。素直にコミットしてツリーを安定させるのが公式推奨**
  （ファイル本文にその旨明記あり）。

## 依存バージョンの完全固定（コミット `5561b06`）

当初 `firebase`/`react`/`react-dom`/`@types/*`/`typescript` に `^`（キャレット）を付けていたが、
「配布ライブラリではなくアプリケーションなので完全固定が望ましい」という判断で `^` を全て除去。
理由:
1. 無関係な依存の意図しないマイナー/パッチ混入を防ぐ（差分レビューが濁る）。
2. `package-lock.json` 任せにしない二重の安全策（lockfile再生成事故への耐性）。
3. バージョンアップを「明示的な作業」として扱う運用にする。

`next` のみ元々キャレット無し（完全固定）だった。

## 動作確認

- `npx tsc --noEmit` エラーなし
- `npm run build`（Turbopack）成功、`middleware`非推奨警告も解消
- `npm run dev` 起動確認（`curl` で `HTTP 200`）

## 関連
- [[依存バージョン固定方針]]
- HANDOFF.md 未解決事項#2（技術スタックのバージョン方針決定）
