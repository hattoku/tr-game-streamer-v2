---
title: TOPの人気のチャンネルのカードに再生リスト・動画・マイリストの数
type: source
date: 2026-11-15
updated: 2026-11-15
commit: cb2c8bc
---

# TOPの人気のチャンネルのカードに再生リスト・動画・マイリストの数

PR #44（2026-11-15）。Notion チケット「TOP人気のチャンネル欄の情報拡充」（親「ユーザビリティ改善」）。仕様は ページ top v2.3 §6A.4、共通 一覧のサーバー側検索 v1.4。

## 変更

- `components/top/PopularChannelsSection.tsx`: カードの件数を「再生リスト N」だけから「N 再生リスト・N 動画・N マイリスト」に。アイコンと文言は再生リスト詳細の配信者欄（[[2026-11-14-channel-card-stats]]）と同じ
- 件数は**幅によらず2行に固定**（1行目 再生リスト・動画、2行目 マイリスト）。チャンネル名は1行でも2行分の高さ（`min-h-[2lh]`）を取り、件数の位置をカード間でそろえる
- `lib/catalog-server.ts`: `channelAggregates` でマイリスト登録数を集計し、`ChannelListItem.mylistCount`、TOP の `popularChannels` に `videoCount`・`mylistCount` を追加。数は掲載中の再生リストの合計で、YouTube API の消費は増えない
- E2E: `e2e/popular-channels.spec.ts` の TOP §6A テストに、件数（掲載していない再生リストは数えない）・2行であること・カードの幅を追加

## ユーザー決定

- カードの幅は今の表示（PC 280px・スマホ 240px）のまま。仕様書の 140px・112px を実際に合わせた
- 最初は件数を折り返しにしていたが、スマホで2行・PCで1行になるのを「統一して」と言われ、2行に固定した（スマホ幅では3つが1行に入らない）
- レビュー数は出さない（配信者欄と同じ）

## ハマりどころ

- `components/ui/cn.ts` は文字列を結合するだけの自前実装で、Tailwind のクラス衝突を解決しない。`CarouselItem` に `className="w-[112px] md:w-[140px]"` を渡しても既定の `w-[240px] md:w-[280px]` が勝っていた。幅などを上書きしたいときは、効いているか実際の表示で確かめること
