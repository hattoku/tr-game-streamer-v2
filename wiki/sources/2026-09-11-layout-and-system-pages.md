---
title: フェーズ2.5 ステップ2 — 共通レイアウト・システムページ・TOP最小版
type: source
date: 2026-09-11
updated: 2026-09-12
commit: 未コミット
---

# フェーズ2.5 ステップ2 — 共通レイアウト・システムページ・TOP最小版

[[2026-09-11-phase2.5-design-plan]] のステップ2。[[2026-09-11-design-foundation]] の部品を
使って、全ページ共通の骨格（ヘッダー・モバイルナビ・フッター）とシステムページ、TOP の最小版を実装した。

## ルートグループの導入

| 前 | 後 | レイアウト |
|---|---|---|
| `app/page.tsx`（Firestore接続テスト） | `app/(main)/page.tsx`（TOP最小版、新規作成） | ヘッダー＋フッター |
| `app/mylist` `app/notifications` `app/playlists/**` | `app/(main)/...` | ヘッダー＋フッター |
| `app/login` | `app/(auth)/login` | ロゴのみの簡易ヘッダー、フッター無し |
| `app/api/**` | 変更なし | — |

- URL は変わらない。ルートレイアウト（`app/layout.tsx`）はプロバイダ（Auth / Layout / Toast）と
  `globals.css` だけを持ち、`(main)/layout.tsx` が `SiteFrame`、`(auth)/layout.tsx` が `AuthLayout` を当てる。
- 移動したページの相対 import（`../../lib/firebase` 等）は深さが変わるため `@/lib/...` `@/contexts/...`
  エイリアスに置き換えた（`tsconfig.json` の `@/*` は元からあった）。
- **Windows で `git mv app/playlists ...` がディレクトリ単位だと Permission denied** になった
  （何かがディレクトリハンドルを掴んでいた）。ファイル単位の `git mv` は通るので、そちらで対応した。
- 古い `.next/types/validator.ts` が移動前のパスを参照して `tsc --noEmit` が失敗する。
  `npm run build` で再生成されれば解消する（ページを移動したら build を先に走らせる）。

## `components/layout/`

| ファイル | 内容 | 根拠 |
|---|---|---|
| nav.ts | ナビ定義（グローバル4項目・ユーザー2項目・フッター3グループ・タグライン・コピーライト）と `isActivePath` | UI仕様書 §2.4, §2.6, §3.3 |
| Header.tsx | sticky ヘッダー。PC: ロゴ／ナビ／ユーザーエリア（1段）、モバイル: ロゴ＋ユーザーエリアのみ、「さがす」一覧ページでは直下に SearchTabs。`compactHeader` で 30px・黒背景 | UI仕様書 §2、トークン §14 |
| UserDropdown.tsx | 28px 円形アイコン（イニシャル）→ ユーザー名・メール／プロフィール／設定／ログアウト（TOPへ） | UI仕様書 §2.6 |
| BottomTabBar.tsx | モバイル固定のボトムタブバー（ホーム／タイムライン／さがす／マイページ）。未ログイン時のマイページはアカウント作成へ。シアターモード中は非表示 | UI仕様書 §2.7 v1.8、トークン §14 |
| MobileMenu.tsx | モバイルのハンバーガーメニュー（左スライドのドロワー）。サポート・規約リンクと©のみ。モバイルではフッター非表示のためその代替 | UI仕様書 §2.7 v1.10、トークン §13.2 |
| TestModeWidget.tsx | 右下固定のテストモードウィジェット。`NEXT_PUBLIC_TEST_MODE=true` のビルドのみ描画。ログインは `/api/test/sign-in`（Admin SDK でテスト用会員を自動作成し使い捨てパスワードを設定）→ `signInWithEmailAndPassword`、ログアウトは `signOut`。モバイルではボトムタブの上に配置 | UI仕様書 §7 v1.13 |
| SearchTabs.tsx | 「さがす」一覧ページ（/playlists /games /channels /collections）でヘッダー直下に出すタブ列。4等幅・2行ラベル（`nav.ts` の `SEARCH_TABS`: main/sub）、高さ 52px。当初の横スクロール方式はスマホではみ出したため v1.12 で変更 | UI仕様書 §2.7 v1.12 |
| ComingSoon.tsx | 準備中ページの共通表示（EmptyState 流用） | UI仕様書 §8 |
| Footer.tsx | ロゴ＋タグライン／サービス・サポート／法的リンク＋コピーライト | UI仕様書 §3 |
| PageContainer.tsx | max-width 1400px、モバイル左右16px、PC 24px | ページレイアウト仕様書 §3, §4 |
| SiteFrame.tsx | Header ＋ main（PageContainer）＋ Footer | — |
| AuthLayout.tsx | ロゴのみヘッダー、幅 400px の中央カラム | ログイン仕様書 §12.1 |
| ErrorContent.tsx | エラーページ共通のコンテンツ（アイコン／コード／タイトル／説明／ボタン、最大600px） | エラーページ仕様書 §2.2, §2.3 |
| LayoutContext.tsx | `compactHeader` の状態。再生リスト詳細のシアターモード（ステップ3）から切り替える | 動画プレーヤー仕様書「シアターモード」 |

### 実装上の判断

- **「アカウント作成」の遷移先**は仕様上 `/signup` だが未実装のため、当面 `/login?mode=signup`
  （`nav.ts` の `SIGNUP_HREF`）。ステップ6でログインページに新規登録モードを付ける。
  `/signup` 本実装時は定数1箇所を戻すだけ。
- 未実装ページ（`/playlists` `/games` `/channels` `/collections` `/history` `/profile/*` `/settings`
  `/about` `/contact` `/site-info` `/terms` `/privacy`）へのリンクは仕様どおり置き、404 ページで受ける。
- ヘッダーの通知ベルはリンクのみ。未読件数バッジはステップ5で付ける。
- ヘッダーの表示名は `users/{uid}.displayName` を使う。`AuthContext` に `displayName` を追加し、
  認証状態確定時に1回 `getDoc` する（失敗しても認証状態には影響させない）。
- `/login` のログアウトボタンはヘッダーのドロップダウンへ移し、ログイン済みで `/login` に来たら
  TOP へ `router.replace`。フォームの見た目はステップ6で。
- テストモードウィジェット・インフォメーションバーは計画どおり見送り。

## 2026-09-12 モバイルナビの再設計（ユーザーフィードバック、2回）

### 1回目: ハンバーガー → ヘッダー下の常時表示ナビバー（v1.7、廃止済み）

スマホ実機で「ナビがハンバーガーに隠れて見えないのは良くない」と指摘を受け、トレヨミのスマホ表示を
参考に、上段（ロゴ／ログイン or ユーザー名）＋下段（探す ▾／まとめ／マイリスト／視聴履歴）の2段に変更した。
`MobileDrawer.tsx` を削除し `MobileNavBar.tsx` を新設（後述の2回目で再度置き換え）。

### 2回目: ボトムタブバー＋「さがす」タブ列（v1.8、現行）

「やはり使いづらい」との再指摘。メニアック（https://meniac.jp/app/ ）のアプリ風UIに倣い、
**画面下部固定のボトムタブバー**で主要導線を切り替える構成に変更した。

- ボトムタブ4つ（`BottomTabBar.tsx`、`nav.ts` の `BOTTOM_TABS`）:
  ホーム `/` ／ タイムライン `/notifications`（暫定。マイリスト登録中の再生リストの新着を時系列で見る導線として
  通知一覧を割り当て） ／ さがす `/playlists`（`/games` `/channels` `/collections` 配下もアクティブ） ／
  マイページ `/mylist`（**未ログイン時は `SIGNUP_HREF` へ**）。アクティブ判定は `activeBottomTab()`
- ホーム・タイムライン・マイページではヘッダー直下にメニューを出さない。「さがす」の一覧ページ4つ
  （`isSearchListPage()`、詳細ページは除外）でのみ `SearchTabs.tsx`（再生リストを探す／ゲームタイトルから探す／
  チャンネル名から探す／まとめを探す。横スクロール、アクティブへ `scrollIntoView`）を出す
- モバイル上段は ロゴ＋「ログイン」ボタン or ユーザーアイコン＋名前 ▾。通知ベルは PC のみ（モバイルはタイムラインタブ）
- `SiteFrame` にタブバー分の下余白（`--spacing-bottom-tabs: 56px` ＋ セーフエリア）。シアターモード中はタブバー非表示
- **「さがす」タブの遷移先が 404 だとタブが機能しない**ため、`/playlists` は公開再生リスト一覧の最小版
  （TOP と共用の `components/playlists/PlaylistGrid.tsx`）、`/games` `/channels` `/collections` は
  準備中ページ（`ComingSoon.tsx`）を暫定で置いた。本実装はフェーズ3以降（各ページ仕様書）
- `MobileNavBar.tsx` は削除。`HomeIcon` `TimelineIcon` `UserIcon` を icons に追加
- PC は従来どおり1段のヘッダー（ユーザーアイコンに名前併記）。**ユーザー指示で PC ナビにも「タイムライン」を追加**（`GLOBAL_NAV` 5項目目、UI仕様書 v1.9 §2.4）
- **タイムラインの中身は後日の課題**（ユーザー決定 2026-09-12）。当面は PC ナビ・ボトムタブとも通知一覧 `/notifications` を割り当てる
- 仕様書: UIコンポーネント仕様書 v1.8（§2.2, §2.7, §2.8, §2.9）、デザイントークン仕様書 v1.4（§14）

### 3回目: ハンバーガーメニューの再導入（フッター代替、v1.10、現行）

「ハンバーガーは必要。サポート／初めての方へ／お問い合わせ／このサイトについて／利用規約／プライバシー
ポリシー／©をまとめて、スマホのフッターのサービス欄・サポート欄を消したい」との指示。
- `MobileMenu.tsx`（Radix Dialog、左からスライド、`--animate-slide-in-left` 追加）を上段ヘッダー左端に配置。
  中身は `FOOTER_SUPPORT_NAV`・`FOOTER_LEGAL_NAV`・`COPYRIGHT` のみ（主要導線はボトムタブ、アカウントは
  ユーザードロップダウンのまま）
- `Footer.tsx` を `hidden md:block` にし、モバイルではフッターを出さない
- 仕様書: UIコンポーネント仕様書 v1.10（§2.2, §2.7, §3.5）、デザイントークン仕様書 v1.5（§13.2 を左スライドで復活）

### モバイルのログインボタン（v1.11）

スマホで「アカウント作成」と「ログイン」が同じ塗りボタンで並んでいる、との指摘。原因は **Tailwind の
`hidden md:inline-flex` をボタン自身に付けていたため、Button 内部の `inline-flex` に負けて隠れない**バグ
（display 系ユーティリティは生成順で勝敗が決まり、クラス属性の並び順は無関係）。表示切替はラッパー
`<div className="hidden md:flex">` / `<div className="md:hidden">` で行うよう修正。あわせてベストプラクティス
（ヘッダーの認証導線は1つ、または主従を付ける）に沿い、モバイルは「ログイン」セカンダリ小型1つだけに確定。

### テストモードウィジェット（2026-09-12）

ログイン中／ログアウト中を1ボタンで切り替えたいとの要望。UI仕様書 §7 どおり右下固定のウィジェットを実装。
- 有効化は `NEXT_PUBLIC_TEST_MODE=true`（`.env.local` に追加済み。Dockerfile に ARG/ENV、cloudbuild.yaml に
  `_TEST_MODE` substitution（既定 ''）を追加したので、本番デプロイでは自動的に無効）
- 資格情報をブラウザに置かないため、サーバー API がカスタムトークンを発行する方式。テスト用会員
  `test-user@puremite.test`（role user、isTestUser true）は初回に自動作成される。`.env.local` は本番 Firebase
  プロジェクトを向いているため、ローカルで押すと**本番 Auth にテスト用会員が1件できる**（仕様 §7.5 に明記）
- 管理者としてのテストは対象外（必要なら別途「管理者に切替」を検討）
- **ハマりどころ**: 当初 `createCustomToken` を使ったが、ローカルの ADC はユーザー認証情報のため
  「Failed to determine service account ... signBlob」で 500。`serviceAccountId` 指定＋IAM の Token Creator 付与で
  回避もできるが、環境依存を避けて **`updateUser` で使い捨てパスワードを設定し直して返す方式** に変更した
  （`signInWithEmailAndPassword`）。`getUserByEmail` / `createUser` / `updateUser` / `setCustomUserClaims` は ADC で動く

## システムページ

| ファイル | 内容 |
|---|---|
| `app/not-found.tsx` | 404（エラーページ仕様書 §3）。虫眼鏡／404／「ページが見つかりません」／TOP・再生リストを探す。ルート直下なので `SiteFrame` を自前で組む。`metadata.title` で「ページが見つかりません \| プレミテ」 |
| `app/error.tsx` | 500（§5）。**Next.js 16 では再試行の prop 名が `reset` ではなく `retry`**（`node_modules/next/dist/docs/.../error.md`） |
| `app/(main)/loading.tsx` | グローバルスケルトン（カードグリッド8枚） |

403 / 503 は発生条件となる機能（非公開まとめ・メンテナンスモード）が未実装のため未作成。
`global-not-found.tsx`（実験的）はルートレイアウトが1つなので不要。

## TOP 最小版（`app/(main)/page.tsx`）

`playlists` を `isPublic == true` ＋ `registeredAt desc`（既存の複合索引）で 24 件取得し、
サムネイル（16:9、右下に「全N話」）／タイトル2行／チャンネルアイコン＋名前／🎮ゲーム名 の
カードグリッド（1〜4列）。空状態・スケルトン・取得エラー表示あり。
本来の TOP（おすすめ・続きから見る等）はフェーズ3以降。

## 仕様書の修正

`共通 エラーページ 仕様書.md` v1.0 → v1.1: §2.4 のページタイトルが「| トレヨミ」
（別プロジェクト名）になっていた誤記を「| プレミテ」に修正。エラーコードの色はグレー系、
ボタンは PC 横並び・モバイル縦並びで確定。

## 動作確認

- `npm run build` 成功（ルート一覧に `/`, `/login`, `/mylist`, `/notifications`, `/playlists/[playlistId]`,
  `/playlists/new`, `/_not-found`）。
- `next start -p 3123` で curl: `/` `/login` `/mylist` `/notifications` `/playlists/new` が 200、
  `/no-such-page` と未実装の `/games` が **404**（title「ページが見つかりません | プレミテ」、
  本文に 404／TOPページへ戻る）。`/login` にはグローバルナビが描画されない。
- ブラウザでの見た目（ドロワーのアニメーション、ドロップダウン、レスポンシブ）は本環境で
  確認できないため、ユーザー側で `npm run dev` → 767px / 768px / 1400px 超 の3幅で確認する。

## 関連
- [[2026-09-11-phase2.5-design-plan]]
- [[2026-09-11-design-foundation]]
- [[デザイントークン運用方針]]
