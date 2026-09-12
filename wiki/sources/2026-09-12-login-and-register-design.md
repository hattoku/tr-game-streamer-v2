---
title: フェーズ2.5 ステップ7 — ログインと再生リスト登録のデザイン適用
type: source
date: 2026-09-12
updated: 2026-09-12
commit: 9c28132
---

# フェーズ2.5 ステップ7 — ログインと再生リスト登録のデザイン適用

[[2026-09-12-login-and-register-design-plan]] の実装記録。フェーズ2.5で最後までノースタイルだった
`/login` と `/playlists/new` にトークン仕様書 v2.0 の部品を当てた。機能は現状維持、仕様書に書かれている
バリデーション文言と `?mode=signup` 対応だけを足した。

## 1. `/login`（`app/(auth)/login/page.tsx`）

| 項目 | 内容 | 根拠 |
|---|---|---|
| 構成 | 見出し（中央）→ メールアドレス → パスワード（表示切替） → プライマリボタン（幅100%）→ モード切替リンク。ソーシャル行と「または」は置かない | ログイン仕様書 §12.1・§12.2、計画書 §2.2 |
| モード | `useSearchParams().get('mode') === 'signup'` でアカウント作成モード。`<LoginForm key={mode}>` でモード切替時に入力とエラーを丸ごと捨てる。`useSearchParams` を使うので `<Suspense>` で包む（Next.js の規約） | `SIGNUP_HREF`（`nav.ts`） |
| 作成モードの追加項目 | パスワード（確認）、`Checkbox`「私は13歳以上です」（未チェックで送信非活性、文言は出さない）、ボタン「アカウントを作成する」、「すでにアカウントをお持ちの方はこちら」 | §8.1・§8.2 |
| 送信時バリデーション | 空欄「入力してください」／メール形式／8文字未満（作成時）／確認不一致。`<form noValidate>` にしてブラウザ標準の吹き出しを止め、`Field` の `error` で統一表示 | §5.3・§8.2 |
| Firebase エラーの日本語化 | `mapAuthError`: `invalid-credential` 系→「メールアドレスまたはパスワードが正しくありません」、`email-already-in-use`→メール欄、`weak-password`→パスワード欄、`too-many-requests`、`network-request-failed`。既知でないものは汎用文＋トースト error | §5.3・§8.2 |
| その他 | `<form onSubmit>` で Enter 送信、送信中は `Button loading`。ログイン済みで来たら TOP へ（現状どおり）。`autoComplete` を login/signup で切替 | — |

**置かなかったもの（ユーザー決定 2026-09-12、後日実装）**: 「パスワードをお忘れの方はこちら」（`/password-reset` 未実装）、
「ログイン状態を維持する」（§5.2 の 24h/7日はクライアント SDK で実現できない）。HANDOFF 未解決事項 8・9 に記録。

## 2. `/playlists/new`（`app/(main)/playlists/new/page.tsx`）

| 項目 | 内容 | 根拠 |
|---|---|---|
| レイアウト | `max-w-[720px]` 1カラム。`Card flush` 1枚の中に URL 入力 → 注意文 → 確認エリア（`CardChildArea`、上下に区切り線）→ ゲームタイトル → 登録ボタン（右寄せ） | 仕様書 §2.1 |
| アクセス制御 | `loading`／未ログイン中はフォーム形のスケルトン、未ログインは `/login` へ `router.replace`（マイリスト・通知と同じ）。一般ユーザーは `EmptyState`「このページは管理者のみ利用できます」＋「TOPへ戻る」 | §1.2、計画書 §4 判断3 |
| URL 入力 | `onBlur` でプレビュー取得。同じ URL の再 blur では取り直さない（`previewedUrl`）。`list=` の無い URL はクライアントで弾き（`isPlaylistUrl`。`lib/youtube.ts` は API キーを持つので import しない）、API を呼ばずインライン＋トースト | §4.1、§7.2 |
| 確認エリア | 取得中はサムネ＋3行スケルトン。取得後は `PlaylistSummary`（サムネ 16:9・タイトル 2行省略・チャンネルアイコン＋名前・「動画数: N本」）＋チェック行（`CheckLine`: ok=`CheckIcon` 緑／ng=`AlertIcon` 赤／info=`InfoIcon` 青。絵文字は使わない）。公開NGなら一致チェック行は出さない。両方 OK のときだけチャンネル状態と、未登録なら説明文 `Textarea`（任意・手入力） | §4.1.1〜4.1.3、§4.1.5 |
| 制約 NG のトースト | 非公開／チャンネル不一致／登録済みはプレビュー取得直後にトースト error も出す（送信ボタンは非活性のまま） | §7.2 |
| ゲームタイトル | 表示部は `INPUT_CLASS` のボタン（入力要素と同じ面＋シェブロン。トークン仕様書 §10「セレクトはブラウザ標準を使わない」）。選択済みは横に `Button ghost` の × で解除 | §4.2 |
| 選択モーダル | `components/playlists/GameSelectModal.tsx`。`Modal`（560px）＋検索 `Input`（`SearchIcon`）＋一覧（`packageImageUrl` 40×56 ＋タイトル、`max-h-[50dvh]` で内側スクロール）。0件文言2種。閉じると検索語をリセット。§4.2.2 の提案リンクは一般ユーザー向けなので出さない | §4.2.1 |
| 送信 | `canSubmit` = 制約OK＋ゲーム選択済み＋送信中でない（現状の条件を維持）。API エラーは `REGISTER_ERRORS` でインライン（ボタン上）＋トースト。成功でトースト success「再生リストを登録しました」 | §4.3、§5.2、§7.2 |
| 完了画面 | 見出し（`CheckIcon` 緑＋「登録が完了しました」）→ `Card` に `PlaylistSummary`（ゲーム名は `Tag emphasis`）→「再生リストを見る」（プライマリ）＋「続けて登録する」（セカンダリ、`resetForm`） | §6.1 |

`components/playlists/PlaylistSummary.tsx` は確認エリアと完了画面で共用（`PlaylistGrid.tsx` 内のローカル型
`PlaylistSummary` とは別物。衝突しないが名前が同じなので、次に触るときはどちらかを改名してよい）。

## 3. 共通部品

今回が初使用だった `Field`（関数 children で `id`/`aria-invalid`/`aria-describedby` を渡す形）・`PasswordInput`・
`Checkbox` はそのままで問題なく、部品側の手入れは不要だった。`CardChildArea` に `border-b` を足して
フォームの中間に置けることを確認（クラスの追加だけで部品は変えていない）。

## 4. 動作確認

- `npx tsc --noEmit` / `npm run build` 成功。
- 実ブラウザ（`scripts/dev/screenshot.mjs`、1440px / 390px）:
  - `/login`: 初期、空欄送信（各欄「入力してください」）、存在しないメールで送信（「メールアドレスまたはパスワードが正しくありません」）
  - `/login?mode=signup`: 初期、形式不正・8文字未満・確認不一致のインラインエラー
  - `/playlists/new`（管理者）: 初期、URL 不正（インライン＋トースト）、取得中スケルトン、未存在（「再生リストが見つかりませんでした」）、
    登録済みの再生リスト（サムネ・チャンネル・動画数・チェック2行OK＋「すでに登録されています」）、ゲーム選択モーダル（検索絞り込み）、選択後の表示
  - 一般ユーザー: 「管理者のみ」の空状態。未ログイン: `/login` へリダイレクト
- **未撮影**: 新規登録の成功（本番 Firebase Auth にユーザーが増える）と完了画面（本番 Firestore に再生リストが増える）。
  コード上の確認のみ。次に実際の登録作業をするときに目視する。

## 5. ハマりどころ

- 撮影スクリプトの `eval` で `input.focus(); input.blur()` としても、ヘッドレス Chrome ではウィンドウにフォーカスが無く
  `blur` が発火しない。React の `onBlur` は `focusout` を聞いているので、`el.dispatchEvent(new FocusEvent('focusout', {bubbles: true}))`
  を直接投げると `onBlur` が動く。値の注入は従来どおり `HTMLInputElement.prototype.value` の setter ＋ `input` イベント。
- `Button` の `size="full"` は `justify-center` 固定で、`cn` は単純結合なので `justify-between` を後から当てても勝つ保証が無い。
  セレクト風の表示部はボタン部品を使わず `INPUT_CLASS` で組んだ（トークン仕様書 §10 の意図にも合う）。

## 関連
- [[2026-09-12-login-and-register-design-plan]]
- [[2026-09-11-phase2.5-design-plan]]
- [[2026-09-12-design-direction-crimson]]
- [[2026-09-10-auth-foundation]]
- [[デザイントークン運用方針]]
