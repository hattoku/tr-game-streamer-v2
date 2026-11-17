/**
 * ログイン要求モーダル（共通 uiコンポーネント フロント 仕様書 §5、ログイン仕様書 §3）の、操作ごとの見出しと本文。
 * 「その操作をするにはアカウントが必要で、作るとこれができる」を、押した操作に合わせて伝える
 * （2026-11-17 アカウント作成導線の改善。視聴ステータスを押したのにレビュー投稿の案内が出る、などのずれを無くす）。
 * 文言を変えるときは仕様書 §5.2 の表も合わせて直す。
 */

export interface LoginPrompt {
  /** 例:「マイリストを使うにはアカウントが必要です」 */
  title: string;
  /** アカウントを作るとその操作で何ができるか */
  description: string;
}

export type LoginPromptKey =
  | 'mylist'
  | 'mypage'
  | 'watchStatus'
  | 'starRating'
  | 'review'
  | 'helpful'
  | 'report'
  | 'addPlaylist'
  | 'applyChannel'
  | 'changeProposal'
  | 'playlistFinished';

export const LOGIN_PROMPTS: Record<LoginPromptKey, LoginPrompt> = {
  mylist: {
    title: 'マイリストを使うにはアカウントが必要です',
    description: '気になる再生リストをマイリストにまとめて、見たところの続きからすぐに再生できます。視聴履歴もここから見られます。',
  },
  mypage: {
    title: 'マイページを使うにはアカウントが必要です',
    description: 'お知らせの確認、提案した再生リストの進み具合、プロフィールや設定の変更ができます。',
  },
  watchStatus: {
    title: '視聴ステータスを記録するにはアカウントが必要です',
    description: '「見たい」「視聴中」「完走」などを記録すると、その再生リストがマイリストに入り、続きからすぐに再生できます。',
  },
  starRating: {
    title: '評価をつけるにはアカウントが必要です',
    description: '見た再生リストに星5段階の評価をつけて、ほかの人の再生リスト選びの参考にしてもらえます。',
  },
  review: {
    title: 'レビューを投稿するにはアカウントが必要です',
    description: '見た再生リストの感想をレビューとして投稿して、ほかの人の再生リスト選びの参考にしてもらえます。',
  },
  helpful: {
    title: '「参考になった」を押すにはアカウントが必要です',
    description: '役に立ったレビューに「参考になった」を送ると、よいレビューが見つけやすくなります。',
  },
  report: {
    title: 'レビューを通報するにはアカウントが必要です',
    description: 'ルールに反するレビューを見つけたら、運営に知らせることができます。',
  },
  addPlaylist: {
    title: '再生リストを追加するにはアカウントが必要です',
    description: 'まだ載っていないゲーム実況の再生リストを提案できます。運営が確認したあと、みんなが見られるようになります。',
  },
  applyChannel: {
    title: 'チャンネルを申請するにはアカウントが必要です',
    description: 'まだ載っていないゲーム実況のチャンネルを申請できます。運営が確認したあと、チャンネルの再生リストが載ります。',
  },
  changeProposal: {
    title: '情報の更新を提案するにはアカウントが必要です',
    description: 'ゲームタイトルやチャンネル、再生リストの情報が違っているときに、正しい情報を運営に提案できます。',
  },
  playlistFinished: {
    title: 'ログインすると、完走の記録やレビューができます',
    description: '「完走」を記録したり、見終わった再生リストのレビューを投稿したりできます。',
  },
};
