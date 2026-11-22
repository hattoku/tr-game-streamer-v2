---
title: 未ログイン時のログイン案内を操作ごとにする（アカウント作成導線の改善）
type: source
date: 2026-11-22
updated: 2026-11-22
---

# 未ログイン時のログイン案内を操作ごとにする

PR #66（2026-11-22 マージ）。Notion チケット「アカウント作成導線の改善」。仕様は 共通 uiコンポーネント フロント 仕様書 v2.11（§2.5・§2.7・§5.2 の表・§5.3）、ログイン仕様書 v1.13 §3・§4.2、ほか各ページ仕様書（レビュー投稿・再生リストを追加する・チャンネル詳細・ゲーム詳細・マイページ・マイリスト・チャンネル検索・実況者向け・変更提案・動画プレーヤー・提案・チャンネル申請）。

## 変更

- 未ログインでボトムタブの「マイリスト」「マイページ」を押すと、ログイン画面へ飛ばさず、その場でできることを書いたモーダルを出す
- モーダルの見出し・本文は押した操作ごと。文言は新規 `components/layout/login-prompts.ts` の `LOGIN_PROMPTS`（mylist／mypage／watchStatus／starRating／review／helpful／report／addPlaylist／applyChannel／changeProposal／playlistFinished）に集約。仕様書 §5.2 の表と同じ文言に保つ。視聴ステータスを押したのにレビュー投稿の案内が出る、というずれを解消
- `LoginRequiredModal` は `prompt`・`next`（省略時は今のパス）・`note` を受け取る。「アカウントを作成する」→ `/login?mode=signup&next=…`、「ログイン」→ `/login?next=…`（`next` が `/` のときは付けない。`loginHref`）。320px で「ログイン」が折れないよう `whitespace-nowrap`
- 新規 `components/layout/LoginGateLink.tsx`: ログイン済みならそのまま遷移、未ログインなら遷移を止めてモーダル。「再生リストを追加する」（チャンネル詳細・ゲーム詳細・再生リスト一覧・浮きボタン）、「チャンネルを申請する」「掲載を申請する」で使う。ログイン後は押したリンクの遷移先へ戻る
- `nav.ts` の `BottomTab.guestHref` を `guestPrompt` に置き換え

## 実装メモ（ハマりどころ）

- `LoginGateLink` はログイン状態の読み込み中（`loading`）は遷移させる（遷移先が未ログインならログインへ送るので行き止まりにならない）。このためE2Eは `e2e/support/guest.ts` の `waitForGuest`（ヘッダーの「ログイン」が出るまで待つ）を挟まないと、読み込み中に押してモーダルが出ない
- ローカルで確認するとき、古い `next start` がポートに残っていると「This page couldn't load」になる。`fuser -k 3100/tcp` してからビルドし直す
- ローカルの stg 向けサーバーでは `/api/test/sign-in` が使えない（stg のデプロイ用サービスアカウントに Firebase Auth の権限が無い）ので、ログイン中のE2Eは stg で流す
- 仕様書の改版履歴は他のPRと重なりやすい。マージのたびに版番号を振り直した（最終: 共通UI v2.11・ログイン v1.13・マトリクス v1.27）

## テスト

- `e2e/login-prompts.spec.ts`（ボトムタブ、視聴ステータス・星・レビュー、再生リストを追加する各所、ログイン中の素通り、チャンネル・掲載の申請）。stg で #63〜#66 まとめて192件成功・失敗0
- 未対応: 「参考になった」「通報」のモーダルのE2E（他のユーザーのコメント付きレビューが要る）
