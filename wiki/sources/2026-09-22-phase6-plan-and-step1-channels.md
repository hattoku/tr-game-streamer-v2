---
title: フェーズ6 計画確定 ＋ ステップ1 — チャンネル（探す・詳細）
type: source
date: 2026-09-22
updated: 2026-09-22
---

# フェーズ6 計画確定 ＋ ステップ1 — チャンネル（探す・詳細）

「channelsページがまだ作成できていないが計画上どうなっているか」というユーザーの問いから始まった
セッション。`/channels`はフェーズ2.5で置いた準備中ページのままで、HANDOFF上はフェーズ6候補として
計画的に先送りされていた。ユーザー決定でフェーズ5（自己ユーザーテスト）を切り上げてフェーズ6へ進み、
その順序を確定した上でステップ1（チャンネル）を実装した。

## 1. フェーズ6の順序（ユーザー決定）

| # | 項目 | 理由 |
|---|---|---|
| 1 | チャンネル（探す→詳細） | 今回の気づき。`channels`は登録時に書き込み済み |
| 2 | TOP本実装 | 毎日見るページ。データは既存 |
| 3 | 管理画面の最小版 | 一人で使うときの運営の手間を減らす |
| 4 | まとめ機能 | プロフィールの前提（まとめ仕様書 §9） |
| 5 | プロフィール | まとめセクション込みで一度に作る |

3案（A: 上記／B: ユーザー向けページを全部揃えてから管理画面／C: 管理画面を2番目）からAを採用。
フェーズ7の項目は前倒ししない。フェーズ6完了後に**フェーズ6.5として自己ユーザーテストを再度**設ける。
依存関係で縛りがあるのは「まとめ→プロフィール」だけで、他は独立。

## 2. ステップ1 実装の要点

- **`/channels`**: `/games`と同じ簡易実装方針（全件クライアント取得＋クライアント側フィルタ・ソート・
  20件ページング）。動画数とピックアップ（スコア上位3件）は`lib/playlist-aggregates.ts`の
  `fetchChannelAggregates`で公開`playlists`から集計（`fetchGameVideoCounts`と同型）。
- **カードのリンク構造**: 情報エリア→チャンネル詳細、ピックアップ各行→動画プレーヤーと遷移先が異なるため、
  カード全体を`<Link>`にせず個別リンクにした（`<a>`の入れ子回避）。部品名は`components/playlists/ChannelCard.tsx`
  （再生リスト詳細の配信者カード）と衝突するので`components/channels/ChannelListCard.tsx`。
- **再生リスト一覧セクションの共用化**: `GamePlaylistSection`の一覧UI（ソート・ページング・空状態）を
  `components/playlists/PlaylistListSection.tsx`に切り出し、ゲーム詳細・チャンネル詳細で共用。
  `fetchPlaylistsByChannel`（`isPublic==true && channelId==X`、等価条件のみで複合インデックス不要）を追加。
- **説明文の管理者編集**: インライン編集＋`app/api/admin/channels/[channelId]`（PATCH、`requireAdmin`）。
  firestore.rulesでは管理者がクライアントSDKから直接書けるが、ゲームタイトル編集APIと同じく
  管理者の書き込みはAdmin SDKのAPI Routeに寄せる方針を踏襲。
- **仕様からの緩和（記録）**: 説明文未設定のチャンネルにも管理者には「説明文を追加する」を出す
  （仕様は「説明文がある場合のみ編集ボタン」。後から付ける手段が他に無いため。詳細仕様書 v1.7 に注記）。
- **「再生リストを追加する」ボタン**: 一般ユーザー向け提案フローが未実装（フェーズ7）のため、
  `GamePlaylistSection`と同じく全ユーザー共通で`/playlists/new?channelId=`へ。
- **流入元チャンネル一致（追加する仕様書 §3.3・§5.2）**: `/playlists/new`にクライアント側の判定
  （プレビューの`channel.youtubeChannelId`と比較、NG行＋インライン＋トースト）と、`register/route.ts`の
  `sourceChannelId`による再検証（`422 channel_mismatch`）の二重チェック。

## 3. 仕様書の整形

探す仕様書は§1〜§3.3が冒頭に二重に貼られており、詳細仕様書はメタデータ・目次・§1が入れ違っていた。
実装注記を追記するついでに整形（探す v1.3、詳細 v1.7、追加する v3.13）。

## 4. 動作確認

`npm run lint` / `npx tsc --noEmit` / `npm run build` 成功。ローカル`npm run dev`（stg、チャンネル11件）＋
Playwright MCPで一覧・詳細・説明文編集（管理者/一般ユーザー）・404・`/playlists/new?channelId=`の不一致NG・
ゲーム詳細の回帰・1440/768/767/390px幅を確認。stgに保存した確認用の説明文は空保存で戻した。

**Playwright MCPの詰まりどころ**: `target`にrole+name形式（`button "キャンセル"`）を渡すとCSSセレクタとして
解釈されエラーになる。スナップショットのref（`f1e213`等）を使うか、`browser_snapshot`で`target`にrefを渡して
部分ツリーを取り直す。

## 関連

- [[2026-09-14-phase3-step2-games]] — `/games`の簡易実装方針・`PlaylistGrid`分解の出発点
- [[2026-09-15-phase3-step4-playlists-search]] — 同じ方針の`/playlists`本実装
- HANDOFF.md「フェーズ6」節（一次記録）
