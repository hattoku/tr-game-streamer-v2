// 詳細ページからの変更の提案（ゲーム・チャンネル・再生リスト）でクライアントとサーバーが共有する定数。
// ページ 詳細ページからの変更提案 仕様書、管理 審査ワークフロー仕様書 §16。
// firebase-admin を import しないこと（クライアントからも読むため）。

export type ChangeTargetType = 'game' | 'channel' | 'playlist';

/** `workflows.type`（対象ごと。ゲームと再生リストは審査ワークフロー仕様書 §3 の既存の種別名） */
export const CHANGE_PROPOSAL_TYPE: Record<ChangeTargetType, string> = {
  game: 'game_title_edit',
  channel: 'channel_report',
  playlist: 'playlist_report',
};
export const CHANGE_PROPOSAL_TYPES = Object.values(CHANGE_PROPOSAL_TYPE);

export function isChangeProposalType(type: unknown): boolean {
  return typeof type === 'string' && CHANGE_PROPOSAL_TYPES.includes(type);
}

export const CHANGE_TARGET_LABEL: Record<ChangeTargetType, string> = {
  game: 'ゲーム',
  channel: 'チャンネル',
  playlist: '再生リスト',
};

/** 同じ対象の提案をまとめるキー（`reportData.targetKey`） */
export function changeTargetKey(targetType: ChangeTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}

/** ゲーム詳細で選べる「違う項目」（複数選べる。仕様書 §4.2） */
export const GAME_CHANGE_FIELDS = [
  { value: 'title', label: 'ゲームタイトル名' },
  { value: 'genre', label: 'ジャンル' },
  { value: 'theme', label: 'テーマ' },
  { value: 'platform', label: '機種' },
  { value: 'image', label: 'パッケージ画像' },
  { value: 'description', label: '説明文' },
  { value: 'duplicate', label: '同じゲームが二重に登録されている' },
  { value: 'other', label: 'その他' },
] as const;
export type GameChangeField = (typeof GAME_CHANGE_FIELDS)[number]['value'];

/** チャンネル詳細の理由（仕様書 §5.2）。detailRequired は補足が必須か */
export const CHANNEL_CHANGE_REASONS = [
  { value: 'not_playing', label: 'もうゲーム実況をしていない', detailRequired: false },
  { value: 'not_official', label: '実況者本人・公式のチャンネルではない（切り抜き・転載など）', detailRequired: false },
  { value: 'other', label: 'その他', detailRequired: true },
] as const;

/** 再生リスト詳細の理由（仕様書 §6.2） */
export const PLAYLIST_CHANGE_REASONS = [
  { value: 'not_game', label: 'ゲーム実況の再生リストではない', detailRequired: false },
  { value: 'mixed_games', label: '複数のゲームが混ざっている', detailRequired: false },
  { value: 'wrong_game', label: '付いているゲームが違う', detailRequired: false },
  { value: 'other', label: 'その他', detailRequired: true },
] as const;

export type ChannelChangeReason = (typeof CHANNEL_CHANGE_REASONS)[number]['value'];
export type PlaylistChangeReason = (typeof PLAYLIST_CHANGE_REASONS)[number]['value'];

export function changeReasonLabel(targetType: ChangeTargetType, reason: string): string {
  if (targetType === 'game') return GAME_CHANGE_FIELDS.find((f) => f.value === reason)?.label ?? reason;
  const list = targetType === 'channel' ? CHANNEL_CHANGE_REASONS : PLAYLIST_CHANGE_REASONS;
  return list.find((r) => r.value === reason)?.label ?? reason;
}

/** 提案の理由の表示（ゲームは選んだ項目を「・」でつなぐ） */
export function describeChangeReason(targetType: ChangeTargetType, reason: string | null, fields: string[] | null): string {
  if (targetType === 'game') return (fields ?? []).map((f) => changeReasonLabel('game', f)).join('・') || '—';
  return reason ? changeReasonLabel(targetType, reason) : '—';
}

/** 補足の上限 */
export const MAX_CHANGE_DETAIL_LENGTH = 500;
/** 1人あたり直近24時間に送れる件数（3種類の合計。仕様書 §7.1） */
export const CHANGE_PROPOSAL_DAILY_LIMIT = 5;

/**
 * 承認したときの処理（仕様書 §8.2）。`none` は自動の処理なし（運営が手で直した）。
 * - non_game / excluded: 再生リストの掲載状態を変える
 * - relink: 再生リストのゲームを付け替える
 * - channel_excluded: チャンネルを掲載から外す
 */
export type ChangeApproveAction = 'none' | 'non_game' | 'excluded' | 'relink' | 'channel_excluded';

export const CHANGE_APPROVE_ACTION_LABEL: Record<ChangeApproveAction, string> = {
  none: '処理なし（手で直した）',
  non_game: '「ゲームではない」にして、さがすから外す',
  excluded: '「対象外」にして、さがすから外す',
  relink: 'ゲームを付け替える',
  channel_excluded: 'チャンネルを掲載から外す',
};

/** 対象ごとに選べる処理 */
export const CHANGE_APPROVE_ACTIONS: Record<ChangeTargetType, ChangeApproveAction[]> = {
  game: ['none'],
  channel: ['channel_excluded', 'none'],
  playlist: ['non_game', 'excluded', 'relink', 'none'],
};

/** 理由ごとの既定の処理（仕様書 §5.4・§6.3） */
export function defaultApproveAction(targetType: ChangeTargetType, reason: string | null): ChangeApproveAction {
  if (targetType === 'channel') return reason === 'other' ? 'none' : 'channel_excluded';
  if (targetType === 'playlist') {
    if (reason === 'not_game') return 'non_game';
    if (reason === 'mixed_games') return 'excluded';
    if (reason === 'wrong_game') return 'relink';
  }
  return 'none';
}

/** 見送り理由（定型。仕様書 §8.3）。選んだ文言を提案した人への通知と提案履歴に出す */
export const CHANGE_REJECT_REASONS = [
  { code: 'correct', label: '確認しましたが、今の内容で合っていました' },
  { code: 'already_fixed', label: 'すでに直っています' },
  { code: 'unverifiable', label: '内容を確かめられませんでした' },
  { code: 'other', label: 'その他（掲載の基準に合わせて判断しました）' },
] as const;

export function changeRejectReasonLabel(code: unknown): string | null {
  return CHANGE_REJECT_REASONS.find((r) => r.code === code)?.label ?? null;
}

/** 提案した人への通知の文面（仕様書 §9.2） */
export function changeResultMessage(targetType: ChangeTargetType, targetName: string, action: 'approve' | 'reject', rejectLabel: string | null): string {
  const target = `${CHANGE_TARGET_LABEL[targetType]}「${targetName}」`;
  return action === 'approve' ? `${target}への提案を反映しました。ありがとうございます` : `${target}への提案は見送りになりました（${rejectLabel ?? ''}）`;
}
