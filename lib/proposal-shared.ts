// 提案（再生リスト登録提案・ゲームタイトル登録提案）でクライアントとサーバーが共有する定数
// （ページ 再生リストを追加する 仕様書 §4.2.2・§5.4、フェーズ7ステップ7-4）。
// firebase-admin を import しないこと（クライアントからも読むため）。

/** `workflows.type`: 再生リスト登録提案 */
export const PLAYLIST_PROPOSAL_TYPE = 'playlist_register';
/** `workflows.type`: ゲームタイトル登録提案（旧形式。新規には作らず、作成済みの記録の表示・審査にだけ使う） */
export const GAME_PROPOSAL_TYPE = 'game_title_register';
/** 管理画面の「提案」セクションに並べる種別 */
export const PROPOSAL_TYPES = [PLAYLIST_PROPOSAL_TYPE, GAME_PROPOSAL_TYPE] as const;

export const PROPOSAL_TYPE_LABEL: Record<string, string> = {
  [PLAYLIST_PROPOSAL_TYPE]: '再生リスト登録提案',
  [GAME_PROPOSAL_TYPE]: 'ゲームタイトル登録提案',
};

/** 新しいゲームタイトルとして入力するとき（§4.2.2 v3.15）の文字数上限 */
export const MAX_GAME_TITLE_LENGTH = 100;
export const MAX_GAME_PROPOSAL_NOTE_LENGTH = 500;
