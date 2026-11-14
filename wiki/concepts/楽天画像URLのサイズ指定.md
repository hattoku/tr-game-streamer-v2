---
title: 楽天画像URLのサイズ指定
type: concept
date: 2026-11-14
updated: 2026-11-14
---

# 楽天画像URLのサイズ指定

楽天ブックス API の `largeImageUrl` は末尾に `?_ex=200x200` が付き、縦長のパッケージだと約123×200px しかない。
楽天の画像サーバーは `_ex` を変えるだけで大きい画像を返す（`1000x1000` で約617×1000px、元画像とほぼ同じ）。

## 方針

- **保存データは書き換えず、表示時に差し替える**（`lib/package-image.ts` の `packageImageSrc(url, 'detail' | 'card')`）。詳細 `600x600`、カード `400x400`。楽天以外の URL はそのまま
- アフィリエイトリンクも同じく「表示時に付ける」方式（`lib/rakuten-affiliate.ts`）。保存するのは素の URL
- 画像は `next/image` ではなく普通の `img` タグなので、ドメイン設定は関係ない

## 関連

- [[2026-11-12-package-image-resolution]]
- 本番で画像が出なかった件は URL ではなくデータが null だった（[[2026-11-11-production-deploy]]）
