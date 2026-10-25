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

/**
 * 再生リスト登録提案の見送り理由（定型。管理 審査ワークフロー仕様書 §14.4、2026-10-25 ユーザー決定）。
 * 選んだ文言をそのまま提案者への通知と提案履歴に出す。`workflows.proposalData.rejectReasonCode` に code を保存する
 */
export const PROPOSAL_REJECT_REASONS = [
  { code: 'duplicate', label: 'すでに登録済み、または同じ提案が審査中' },
  { code: 'not_game_play', label: 'ゲーム実況の再生リストではない' },
  { code: 'mixed_games', label: '1つのゲームの実況にまとまっていない（複数のゲームが混ざっている）' },
  { code: 'unavailable', label: '再生リストが非公開・削除済み、または動画が少なすぎる' },
  { code: 'other', label: 'その他（掲載の基準に合わない）' },
] as const;
export type ProposalRejectReasonCode = (typeof PROPOSAL_REJECT_REASONS)[number]['code'];

export function proposalRejectReasonLabel(code: unknown): string | null {
  return PROPOSAL_REJECT_REASONS.find((r) => r.code === code)?.label ?? null;
}

/** 提案に残す楽天ブックスの商品情報（`proposalData.newGameRakuten`、§9.2 v4.0） */
export interface ProposalRakutenItem {
  itemUrl: string;
  title: string;
  imageUrl: string;
  hardware: string;
  booksGenreId: string;
}

/** 新しいゲームタイトルで選べる機種の上限（候補は lib/game-shared.ts の PLATFORM_OPTIONS） */
export const MAX_GAME_PROPOSAL_PLATFORMS = 18;
