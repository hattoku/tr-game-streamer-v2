---
title: /_next/static を長期キャッシュに戻す（PWA の起動待ち対策）
type: source
date: 2026-10-25
updated: 2026-11-14
commit: 4e8dd7a
---

# /_next/static を長期キャッシュに戻す（PWA の起動待ち対策）

PR #4（`4e8dd7a`・`9701abd`、2026-10-25 main へ）。

## 経緯

iPhone の PWA で「その日最初の起動だけスプラッシュで約5秒待つ」件を調査。

- 主因は Cloud Run の最小インスタンス数 0 によるコールドスタート（stg で `minScale: 0` を確認）。
  **費用を優先して 0 のまま**にした（ユーザー決定。最小インスタンス1は最大約$10/月、定期起こしはほぼ0円だが不確実で見送り）。判断は技術スタック仕様書 v2.15 §2.11
- 副因として、`firebase.json` の全パス `Cache-Control: private, no-store`（2026-09-19 のゲート素通り対策、[[2026-09-23-stg-cookie-gate]]）が
  ハッシュ付きの `/_next/static/**` にも効いており、起動のたびに JS・CSS を Cloud Run から取り直していた

## 変更

- `firebase.json`: `/_next/static/**` に `Cache-Control: public, max-age=31536000, immutable` を**後段のルール**として追加（Hosting のヘッダーは後のルールが優先）。ページ・API は no-store のまま
- 本番反映は Hosting のデプロイだけで足りる

## 再発時

「起動が遅い」と言われたら同じ調査をやり直さず、最小インスタンス1／定期起こしの2案を再提示する。

## 関連

- [[Firebase Hostingのcookie制限]]
