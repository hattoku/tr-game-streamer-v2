---
title: Wiki索引
type: meta
date: 2026-09-08
updated: 2026-11-14
---


# Wiki 索引

tr-game-streamer-v2 の**コーディング支援用**Wiki（実装の変更履歴・技術的決定を記録）。
設計・企画レベルの検討は別リポジトリ `ak_tr_game_streamer_dev` が担当する
（役割分担は [[CLAUDE.md]] 参照）。プロジェクト全体像は [[overview]] を参照。

## Sources
- [[2026-09-09-firestore-security-rules]] — Firestoreセキュリティルールの本設計・本番デプロイ
- [[2026-09-09-tech-stack-upgrade]] — 技術スタックの最新化とバージョン固定
- [[2026-09-09-phase1-plan-review]] — フェーズ1計画の妥当性レビューとHANDOFF.md更新
- [[2026-09-10-master-data-seed-script]] — マスタデータ投入スクリプトの実装
- [[2026-09-10-auth-foundation]] — 認証まわりの実装土台（AuthContext・init-user API）
- [[2026-09-10-phase2-plan]] — フェーズ2計画の精緻化（依存チェーン・スキーマギャップ）
- [[2026-09-11-phase2.5-design-plan]] — フェーズ2.5（デザイン適用）計画（Tailwind導入・仕様書の穴埋め・8ステップ）
- [[2026-09-11-design-foundation]] — フェーズ2.5 ステップ0・1（仕様書の穴埋め、Tailwind v4＋Radix導入、components/ui）
- [[2026-09-11-layout-and-system-pages]] — フェーズ2.5 ステップ2（ルートグループ導入、ヘッダー/フッター/ドロワー、404/500/loading、TOP最小版）
- [[2026-09-12-playlist-detail-design]] — フェーズ2.5 ステップ3（再生リスト詳細の部品化・2カラム・シアターモード・マイリスト追加・ログイン要求モーダル）
- [[2026-09-12-design-direction-crimson]] — フェーズ2.5 ステップ4.5（デザイン方針の見直し: 4案比較→A. クリムゾン採用、トークン仕様書 v2.0、共通部品の作り直し）
- [[2026-09-12-mylist-design]] — フェーズ2.5 ステップ5（マイリスト: MylistCard 部品化、タブ・ソート・子エリア・新着行・空状態、最終話判定の索引回避）
- [[2026-09-12-notifications-design]] — フェーズ2.5 ステップ6（通知一覧・ヘッダーベルの未読バッジ、「タイムライン」廃止→ボトムタブ「マイリスト」、マイページは暫定 /history）
- [[2026-09-12-login-and-register-design-plan]] — フェーズ2.5 ステップ7（ログイン・再生リスト登録のデザイン適用）実装計画（スコープの線引き・バリデーション文言・ゲーム選択モーダル・確認手順・要確認の判断4点）
- [[2026-09-12-login-and-register-design]] — フェーズ2.5 ステップ7 実装記録（`/login` の signup モード・バリデーション・Firebase エラー日本語化、`/playlists/new` の確認エリア・GameSelectModal・PlaylistSummary・完了画面、撮影で focusout を使う話）
- [[2026-09-13-phase2.5-finish]] — フェーズ2.5 ステップ8 仕上げ（3幅確認で 768〜1023px のヘッダー折り返しを修正、キーボード/aria の実機確認と `aria-modal`、`next lint` 廃止と typescript-eslint の TS 7 未対応を受けた Babel パーサーによる ESLint 導入、react-hooks の指摘修正）。フェーズ2.5 完了
- [[2026-09-13-phase3-step1-reviews]] — フェーズ3 ステップ1（レビュー・スコアリング機能）。信頼度スコアはAdmin SDK側で算出、NGワードはサーバー側のみで判定、`reviews`への投稿者非正規化コピー追加、D=0で信頼度が0になる不具合と下限値対応
- [[2026-09-14-phase3-step2-games]] — フェーズ3 ステップ2（ゲームタイトル探す・詳細ページ）。`PlaylistGrid`の分解・再利用、実機確認で見つかった検索UI4件の修正（×ボタン二重表示・適用中フィルターの左カラム常時表示・絞り込みバッジのトグル化・Tagのホバー効果不備）
- [[2026-09-15-phase3-step3-tags]] — フェーズ3 ステップ3（タグシステム）。タグ付与・削除のAdmin SDK APIルート、`TagEditModal`共通部品、`.mjs`スクリプトのAPIルートからの再利用
- [[2026-09-15-phase3-step4-playlists-search]] — フェーズ3 ステップ4（再生リストを探す本実装）。`/games`と同じ簡易実装方針、`PlaylistCardGrid`のタグ表示をgameNameの仮置きから実データに置き換え
- [[2026-09-15-phase3-step5-finish]] — フェーズ3 ステップ5（仕上げ）。768pxで再生リスト詳細ページがオーバーフローする不具合を発見・修正（グリッドアイテムのmin-w-0欠落）、タグ絞り込みパネルの本番E2E確認。フェーズ3完了
- [[2026-09-20-phase4.5-step7-partial]] — フェーズ4.5 ステップ7（仕上げ）。/history・/settingsの3幅/aria確認、stg棚卸し（ルール一致・インデックス差分1件・Auth一致・マスタデータほぼ一致）、stg/本番デプロイ実施。本番向けgcloud操作はauto modeにブロックされユーザーが自ら実行。フェーズ4.5完了
- [[2026-09-22-phase6-plan-and-step1-channels]] — フェーズ6の順序確定（チャンネル→TOP→管理画面→まとめ→プロフィール、完了後にフェーズ6.5で自己ユーザーテスト再）とステップ1（`/channels`・`/channels/[channelId]`本実装）。`PlaylistListSection`への共用化、`fetchChannelAggregates`、説明文の管理者編集API、`/playlists/new?channelId=`の流入元チャンネル一致確認
- [[2026-09-22-phase6-step2-top]] — フェーズ6 ステップ2（TOP本実装）。ヒーロー・マイリスト・注目（ジャンルタブ）・新着・タグピックアップの各セクション、共通カルーセル部品（`Carousel`・`useCarouselNav`・`SectionHeaderRow`）、`/mylist`のデータ取得を`lib/mylist-entries.ts`へ共用化、`/playlists`の`?q=`/`?sort=`/`?tag=`流入対応。dev-orchestrator経由のレビューでジャンルタブの横スクロールバグ・進捗バーサイズ・見出しサイズ不整合・送りボタンの欠落・検索ボタン欠落を修正
- [[2026-09-22-phase6-step3-admin-minimal]] — フェーズ6 ステップ3（管理画面の最小版）。ユーザー決定で範囲を「ダッシュボード集約＋審査ワークフローのうち通報のみ」に縮小、権限はoperator/owner共通。`/admin`（通報未処理件数＋新着動画再取得の移設）・`/admin/workflows`・`/admin/workflows/[workflowId]`（単一ステップの承認/却下、承認時は対象レビューを物理削除しスコア再計算）を新規実装。dev-orchestrator経由のレビューで、仕様書側への実装注記追記漏れ（2仕様書にv1.5・v8.0として追加）、`text-3xl`のトークンスケール逸脱、モバイル幅でのヘッダーナビ折り返し対策漏れを修正
- [[2026-09-20-env-default-stg]] — stg/本番のDB分離を調査（分離済みと確認）。「共通」の正体だった「`NEXT_PUBLIC_APP_ENV`未指定時の接続先が本番」を`lib/app-env.ts`新設で「明示しない限りstg」に反転。`dev:prod`/`build:prod`追加、テストモードを本番で無効化。併せて`deploy.ps1`にFirestoreルール/インデックスデプロイを組み込み、Firebase Webアプリ設定を`lib/firebase.ts`直書き一本化（`.env.local`に旧appIdが残っていた）
- [[2026-09-23-stg-cookie-gate]] — HTTP Basic認証→Cookieベースの共有パスワードゲート（30日間・パスワードのみ）へ移行。`lib/stg-gate.ts`新設、`/stg-login`ページ・`app/api/stg-gate/route.ts`追加
- [[2026-10-08-plan-review-phase6.5]] — 全体計画（HANDOFF.md）の見直し。9/23〜10/7の45コミットをフェーズ6.5（自己テスト）の前倒しとして記録し区切り、次はフェーズ6ステップ4（まとめ機能）。未実装機能の棚卸し表・Basic認証の記述を実態に更新
- [[2026-10-08-phase6-step4-1-collections]] — フェーズ6 ステップ4-1（まとめ機能: 作成・編集・削除・詳細・「まとめに追加する」・並び替え）。まとめ機能を4-1/4-2/4-3に分割。`/collections/mine` 新設、↑↓のみの並び替え、作成者名の非正規化、書き込みはAPI Routeのみ（rules を `allow write: if false`）。レビューでAPI入力の防御・上限判定のトランザクション化・aria-label を対応
- [[2026-10-12-phase6-step4-2-collections-discovery]] — フェーズ6 ステップ4-2（まとめを探す `/collections` と発見導線）。並び順は新着順のみ（保存数順は4-3）、PC 2列。再生リスト詳細「この再生リストを含むまとめ」・TOP「新着のまとめ」・探すページの自分のまとめ導線。等価条件＋array-containsは複合インデックス不要と確認
- [[2026-10-12-phase6-step4-3-collections-save]] — フェーズ6 ステップ4-3（まとめの保存機能）。新コレクション `saved_collections`、保存・解除・一覧はすべてAPI（savedCountとトランザクション）、`/collections/saved`（非公開化は案内行、削除は自動除去）、保存数順ソート。退会時の削除は退会機能未実装のため積み残し
- [[2026-10-12-phase6-step5-1-profile-view]] — フェーズ6 ステップ5-1（プロフィール閲覧ページ `/profile/[userId]`）。5-1閲覧/5-2編集に分割、画像アップロードは見送り。他人の users・mylist は rules を緩めず Admin SDK の公開API（ログイン任意、`getOptionalUid`）で返す。じゃばら共通部品、ネタバレ設定を `spoiler.tsx` に切り出し
- [[2026-10-14-phase7-step7-3-1-inquiries]] — フェーズ7 ステップ7-3-1（お問い合わせフォーム `/contact`＋管理画面 `/admin/inquiries` 一覧・詳細）。7-3 を2分割、メール通知は見送り。データモデル §3.17 改訂（status 4状態・body/relatedUrls）、書き込みは API のみ。7-3-2 前に operatorMemo の秘匿方法を決める申し送りあり
- [[2026-10-15-related-game-heading]] — 再生リスト詳細の「ゲーム」見出しを「関連ゲーム」に変更（楽天ブックスの画像が配信機種と一致しないことがあるため）。仕様書3本の呼称も統一（`de8cf09`）
- [[2026-10-22-node24-docker-image]] — 本番イメージの Node.js を 20（EOL）から 24.22.1 に更新（2026-10-21 セキュリティリリース対応、Dockerfile 3ステージ、`b1dac1c`）
- [[2026-10-24-phase7-step7-3-2-inquiry-history]] — フェーズ7 ステップ7-3-2（`/contact/history`・ユーザー側スレッド）。`operatorMemo` を渡さないため本人専用 API で返し、rules で本人の直接読み取りを閉じた
- [[2026-10-25-phase7-step7-4-proposals]] — フェーズ7 ステップ7-4（一般ユーザーの再生リスト提案と審査）と 10-26 の作り込み。登録処理を `lib/playlist-registration.ts` に切り出し
- [[2026-10-25-e2e-foundation]] — stg に対する Playwright E2E の仕組み（PR #2）。テストモード常時有効、`[E2E]` データの後始末、環境変数の `#` の罠
- [[2026-10-25-pwa-static-cache]] — PWA の起動待ち。最小インスタンスは費用優先で0のまま、`/_next/static/**` だけ immutable に戻す（PR #4）
- [[2026-10-25-top-featured-exclude-completed]] — TOP 注目から完走済みを除く（PR #5）
- [[2026-10-25-admin-header-purple]] — 管理画面ヘッダーをパープル配色に、`color-admin-*` トークン（PR #7）
- [[2026-10-26-phase7-step7-5-content-collection]] — フェーズ7 ステップ7-5（有名チャンネル起点の自動探索、まとめて承認、タグ一覧）
- [[2026-10-26-proposal-review-two-step]] — 審査画面を「ゲームタイトルを決める→承認」の2段に、`approveBlockedReason`（PR #9）
- [[2026-10-28-collection-bulk-approve-new-games]] — 推定なしの候補もまとめて承認（`newGameTitle`）、候補を動画10本以上に（PR #10）
- [[2026-10-28-inquiry-image-attachments]] — お問い合わせへの画像添付。sharp での描き直し、Storage 全拒否＋API 閲覧、180日で削除（PR #11）
- [[2026-10-28-cloud-stg-deploy]] — クラウドから stg へのデプロイスクリプトと、Storage ルールを Rules API で反映する回避（PR #6・#13）
- [[2026-10-28-player-sleep-recovery]] — スリープ復帰で再生位置が 0 になる問題、プレーヤーの作り直しと作り直し後の表示（PR #12・#22）
- [[2026-11-01-collection-rakuten-pick-and-game-unset]] — ページ送りが終わらない不具合、楽天の商品の事前選択、ゲーム未設定の登録（段階A・B）（PR #14）
- [[2026-11-01-new-videos-diff-refresh]] — 新着動画の取得を `youtubeItemCount` の差分に（約7,700→860ユニット/日の試算）（PR #15）
- [[2026-11-01-rebranding-docs]] — リブランディング段階1の仕様書書き換えと「掲載チャンネル」への言い換え。DB 名は `authorized*` のまま（PR #16・#19）
- [[2026-11-01-rebranding-stage2-collections-withdrawn]] — まとめ機能の取り下げ（`COLLECTIONS_ENABLED`、proxy で 404）（PR #17）
- [[2026-11-01-rebranding-stage3-listing-status]] — `listingStatus` と移行スクリプト。本番は移行→デプロイの順（PR #18）
- [[2026-11-04-game-unset-user-link-and-proposal]] — ゲーム未設定の再生リストにユーザーがゲームを登録（審査なし）・新しいゲームタイトルを提案（審査あり）（PR #20・#21）
- [[2026-11-08-rebranding-stage4-sweep]] — 巡回で全件保存し掲載状態を自動判定、掲載方法、30日ルール（PR #23）
- [[2026-11-08-rebranding-stage6-applications]] — チャンネル申請・提案の分岐・`/creators`（PR #24）
- [[2026-11-08-rebranding-stage7-server-search]] — 一覧をサーバー側検索に（メモリ索引＋onSnapshot、`/api/catalog/*`、回数制限）（PR #25）
- [[2026-11-08-rebranding-stage5-popular-channels]] — 人気のチャンネルと人気順、`playlist_viewers`、毎日の集計（PR #26）
- [[2026-11-11-production-deploy]] — 本番デプロイ（main `1525320`、移行→デプロイ、ジョブ3つ、`CRON_SECRET` のローテーション、本番 backfill）
- [[2026-11-12-package-image-resolution]] — 楽天画像の `_ex` を表示時に差し替え、スマホのゲーム詳細レイアウト（PR #27）
- [[2026-11-12-collection-review-images-icons]] — 自動掲載の確認にゲーム画像・チャンネルアイコン・付いているゲームのモーダル、巡回で空のアイコンを補う（PR #28・#30）
- [[2026-11-14-unavailable-videos]] — 削除済み・非公開の動画を取り込まず、消えた動画のドキュメントを消す（PR #29）
- [[2026-11-14-new-video-notification-and-videolist]] — 再生リスト新着の通知に配信者と動画タイトル、動画リストの投稿日（年つき）・NEW・再生時間・見出し（PR #31〜#34）
- [[2026-11-14-channel-card-stats]] — 再生リスト詳細の配信者欄に再生リスト数・動画数・マイリスト数（一覧 API の合計を使い YouTube API は使わない、PR #35）
- [[2026-11-14-mypage-hub]] — スマホの「マイページ」タブを視聴履歴から項目一覧の `/mypage` に。タブのアクティブ判定は一番長く一致したプレフィクス
- [[2026-11-14-mylist-reverse-toggle-removed]] — マイリストのカードから逆順ボタンを外し、切り替えは再生リストページだけにする（設定値は残す）
- [[2026-11-14-notification-unread-dot]] — 通知カードの未読ドットを左端の列から日時の左へ（既読時の左の空白をなくす）
- [[2026-11-14-mylist-continue-row]] — マイリストの「続きから再生」を幅いっぱいの赤ボタンから行全体のリンク＋右端の丸い再生アイコンに（iPhone は右矢印）

## Entities
- [[proxy]] — proxy.ts（旧middleware.ts、Next.js 16のproxy規約対応）。まとめ取り下げ後は `/collections*` を 404 に書き換える
- [[stg-gate]] — lib/stg-gate.ts（Cookieゲートのトークン導出ロジック）
- [[catalog-server]] — lib/catalog-server.ts（一覧のサーバー側検索。メモリ索引＋onSnapshot）

## Concepts
- [[firestoreセキュリティルール方針]] — ロール判定・コレクション別ポリシー
- [[依存バージョン固定方針]] — package.jsonのバージョン記法方針
- [[マスタデータ投入方針]] — 投入対象の規模・ID採番ルール・Admin SDK必須の理由
- [[ステージング環境運用方針]] — 設定は都度同期・データ検証はフェーズ4まで後回しの方針。2026-09-20棚卸しで方針どおりの一致を確認（インデックス差分1件のみ）。同日、ローカル開発のデフォルト接続先をstgに反転、シークレット共有の備忘録を追記
- [[デザイントークン運用方針]] — 仕様書トークン→`@theme`の1対1対応、`@utility`のグラデーション面、1px半透明白の枠線、奥行きの3段階、刺し色の原則（2色目を足さない）、セレクトはSelectMenu、ヘッドレスUI方針
- [[react-hooksのset-state-in-effect対応]] — 購読系はコールバック/クリーンアップで、「propが変わったらstateを調整する」は描画中に直接setState、導出値はstate化しない
- [[CSSグリッドのmin-width対策]] — `fr`単位でもグリッドアイテムのmin-width初期値はauto。直下の子要素にmin-w-0が無いと内容の最小幅でトラックがオーバーフローする
- [[auto modeの本番操作制限]] — 本番プロジェクトへのgcloud/deploy操作はauto modeの許可分類器の対象になりうるが、何がブロックされるかは一定ではない（2026-09-23追記: ユーザー依頼のdeploy.ps1 prodは通り、gcloud describeでのシークレット値読み取りはブロックされた）
- [[Firebase Hostingのcookie制限]] — Firebase Hostingは`__session`以外の名前のCookieをCloud Runへのリクエストから除去する。直接のCloud Run URLでは動くがカスタムドメイン経由だけ認証が通らない、という形で発覚
- [[YouTube Data APIのハマりどころ]] — ページ送りが終わらない、削除済み・非公開の動画も返る、`snippet.publishedAt` は追加日時、クォータの目安
- [[YouTubeデータの30日ルール]] — API 規約 III.E.4。25日で取り直し・30日で削除、ユーザーの記録がある再生リストは残す
- [[掲載状態と検索面]] — `listingStatus` の値と、検索面は「公開かつ listed」だけ。移行→デプロイの順、ロールバックしない
- [[楽天画像URLのサイズ指定]] — `_ex=200x200` を表示時に差し替える。保存データは書き換えない
- [[クラウドからのstgデプロイ]] — `deploy-stg-cloud.sh` の前提・権限・回避策。本番はクラウドから行わない
- [[stgとE2Eの同時実行]] — stg は1つ。デプロイと E2E の後始末がぶつかる、再取得を動かす spec は1ファイルずつ

## Analyses
（まだページなし）

---
このindexはIngest / Query操作のたびに更新すること。
