---
title: フェーズ6 ステップ5-1 — プロフィール閲覧ページ
type: source
date: 2026-10-12
updated: 2026-10-12
---

# フェーズ6 ステップ5-1 — プロフィール閲覧ページ

[[2026-10-12-phase6-step4-3-collections-save]] の続き。まとめ機能の完了を受けて `/profile/[userId]` を実装（プロフィール仕様書＋まとめ機能仕様書 §9）。

## ユーザー決定事項（着手時）

- **2分割**: 5-1 閲覧ページ → 5-2 編集・導線（インライン編集、設定ページの公開設定トグル、投稿者名・作成者名リンク）
- **プロフィール画像のアップロードは見送り**（Firebase Storage 未導入。バケット・storage.rules・デプロイ設定から必要になるため）。アバターは頭文字表示
- **他人の `users`・`mylist` は Admin SDK の公開APIで返す**。firestore.rules は緩めない（緩めると email 等まで読めてしまい、分離コレクションが必要になる）

## 実装内容

- API `app/api/users/[userId]/profile`（GET、ログイン任意）。`lib/api-auth.ts` に `getOptionalUid`（トークンが無い・無効なら null）を追加。
  ヘッダー（公開フィールドのみ）・統計（reviews の集計、mylist のステータス内訳）・ジャンル上位3件（reviews→playlists.gameId→games.genreName をゲーム単位で重複除去、同数は `localeCompare('ja')`）・
  マイリスト・レビュー履歴（他人には公開設定OFFなら null）・公開まとめ（`sortOrder` 昇順→作成日降順）とそのサムネイルを1回で返す。
  存在しない／BAN済みは 404。クエリは `userId` 等値（まとめは `visibility` 等値も）のみで複合インデックス不要。
- ページ `app/(main)/profile/[userId]/page.tsx`。ログイン状態の確定を待って IDトークン付きで取得（本人なら全セクション）。
  `key={userId}` の子コンポーネントに分け、別ユーザーのプロフィールへ遷移したときに state を持ち越さない。
- 共通部品: `components/profile/ProfileAccordion.tsx`（§3.2 じゃばら: 上位3件＋「すべて見る（N件）」→20件ページング＋「折りたたむ」）、
  `ProfilePlaylistCard.tsx`（サムネイル左・タイトル・ゲーム名・meta、下段に children）。
- `ReviewList` のネタバレ設定を `components/reviews/spoiler.tsx`（`useHideSpoilers`・`SpoilerRevealButton`）に切り出してプロフィールと共有。
- ユーザーメニュー「プロフィール」が `/profile/`（404）だったのを `/profile/{uid}` に修正。
- 保存したまとめセクション（本人のみ）は既存 `/api/collections/saved` を再利用し、閲覧可能なものだけ表示。

## 仕様からの差分（仕様書冒頭の実装状況に記載）

- 統計は再生リストの公開状態を問わない総数、カード・ジャンル分布は公開再生リストのみ → 件数が食い違うことがある
- レビュー履歴にはコメント無しの投稿も並べる（再生リスト詳細のレビュー一覧とは異なる）
- 公開設定ボタンは「公開設定」（鍵アイコン）。設定ページ側のトグルは5-2
- まとめセクションは他人のページで0件ならセクションごと非表示

## レビュー（dev-orchestrator → spec・design 並列）

- design: userId 変化時の state 持ち越し、見出しを `SectionHeading` に、統計カードに `min-w-0`、保存一覧リンクを `LinkButton ghost`、古いコメント → 対応
- spec: 統計とレビュー履歴の件数差を仕様書に明記 → 対応。データモデル設計書の公開設定既定値のずれは5-2の宿題（HANDOFF）
- 見送り: spoiler の LocalStorage 遅延初期化による hydration の懸念は ReviewList の既存挙動で、プロフィールではレビューが取得後に描画されるため対象外

## 動作確認

lint / tsc / build 成功。stg＋Playwright（テストモードの一般ユーザー＝本人、テスト管理者＝他人）で出し分け・公開設定OFF時の非表示（本人は表示）・404を確認。
390/768/1440px で横スクロール無し。公開設定は一時スクリプトで切り替え、確認後に元へ戻した。

## ユーザー確認後の追加対応

- マイリストカードのサムネイル右下に話数（`CountLabel`「N話」）。API の再生リスト情報に `videoCount` を追加
- サムネイルのホバー効果: カード内に複数リンクがあるため `Card interactive`（浮き上がり）は使わず、サムネイルのリンクに `group` を付けて
  画像を `scale-[1.04]`＋`brightness-110`。**Tailwind v4 の `scale-*` は `transform` ではなく独立した `scale` プロパティ**なので、
  トランジションは `transition-[scale,filter]` と書く（`transition-[transform,…]` だとアニメーションしない）。
  `components/ui/Card.tsx` の `THUMBNAIL_HOVER_IMG_CLASS` に共通化し、まとめカード（3枚並びのサムネイル）とまとめ詳細の再生リストカードにも適用
- 遷移時のスクロール位置の不具合（アプリ全体）: Next.js の `<Link>` は遷移先の Page 要素が画面内に見えていればスクロール位置を保つため、
  長いページの下の方→短いページ（プロフィール→まとめ詳細）で最下部付近に着地していた。`ScrollToTopOnNavigate` を `SiteFrame` に置き、
  パス名変更時に先頭へ（popstate・クエリのみ・ハッシュ付きは除外）
- プロフィールの公開範囲と他人のマイリスト・レビュー履歴の見せ方は、HANDOFF 未解決事項15として別タスクに切り出した

## 次のステップ

5-2 編集・導線。表示名変更時の `reviews`/`collections` 非正規化名の更新漏れは積み残しとして記録予定。
