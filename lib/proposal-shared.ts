// 提案（再生リスト登録提案・ゲームタイトル登録提案）でクライアントとサーバーが共有する定数
// （ページ 提案する 仕様書、管理 審査ワークフロー仕様書 §4.2・§4.3）。
// firebase-admin を import しないこと（クライアントからも読むため）。
import { CHANNEL_APPLICATION_TYPE } from './channel-application-shared';

/** `workflows.type`: 再生リスト登録提案 */
export const PLAYLIST_PROPOSAL_TYPE = 'playlist_register';
/**
 * `workflows.type`: ゲームタイトル登録提案。ゲーム未設定の再生リストに付けたいゲームの提案（`proposalData.playlistId` 付き、
 * 再生リスト詳細の「ゲームを登録」）で作る。`proposalData.playlistUrl` 付きの旧形式は 2026-10-25 以降は作られない
 */
export const GAME_PROPOSAL_TYPE = 'game_title_register';
/** 管理画面の「提案」セクションに並べる種別（審査ワークフロー仕様書 §5.1） */
export const PROPOSAL_TYPES = [PLAYLIST_PROPOSAL_TYPE, GAME_PROPOSAL_TYPE, CHANNEL_APPLICATION_TYPE] as const;

export const PROPOSAL_TYPE_LABEL: Record<string, string> = {
  [PLAYLIST_PROPOSAL_TYPE]: '再生リスト登録提案',
  [GAME_PROPOSAL_TYPE]: 'ゲームタイトル登録提案',
  [CHANNEL_APPLICATION_TYPE]: 'チャンネル申請',
};

/** 新しいゲームタイトルとして入力するとき（§4.2.2 v3.15）の文字数上限 */
export const MAX_GAME_TITLE_LENGTH = 100;
export const MAX_GAME_PROPOSAL_NOTE_LENGTH = 500;

/**
 * 再生リスト登録提案の見送り理由（定型。管理 審査ワークフロー仕様書 §4.2、2026-10-25 ユーザー決定）。
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

/** 再生リスト登録提案の審査結果の通知文（審査ワークフロー仕様書 §4.2）。却下は定型の見送り理由を添える */
export function playlistProposalResultMessage(playlistTitle: string, action: 'approve' | 'reject', rejectReasonLabel: string | null): string {
  return action === 'approve'
    ? `再生リスト「${playlistTitle}」の提案が承認され、公開されました`
    : `再生リスト「${playlistTitle}」の提案は見送りになりました（${rejectReasonLabel}）`;
}

/** 再生リストに付けたいゲームタイトル提案の審査結果の通知文（審査ワークフロー仕様書 §4.3） */
export function gameProposalResultMessage(gameTitle: string, action: 'approve' | 'reject'): string {
  return action === 'approve'
    ? `ゲームタイトル「${gameTitle}」の提案が承認され、再生リストに登録されました`
    : `ゲームタイトル「${gameTitle}」の提案は見送りになりました（運営の判断で、既存のゲームタイトルに合わせるか、登録を見送りました）`;
}

/** 提案に残す楽天ブックスの商品情報（`proposalData.newGameRakuten`、§9.2 v4.0） */
export interface ProposalRakutenItem {
  itemUrl: string;
  title: string;
  imageUrl: string;
  hardware: string;
  booksGenreId: string;
}
