// チャンネル申請（`workflows.type: channel_application`）でクライアントとサーバーが共有する定数。
// ページ チャンネルを申請する 仕様書、管理 審査ワークフロー仕様書 §15.2・§15.4（リブランディング段階6）。
// firebase-admin を import しないこと（クライアントからも読むため）。

/** `workflows.type`: チャンネル申請 */
export const CHANNEL_APPLICATION_TYPE = 'channel_application';

/** 申請者の種別（自己申告。運営の参考情報） */
export const APPLICANT_TYPES = [
  { value: 'creator', label: '自分（または所属事務所）のチャンネル' },
  { value: 'viewer', label: '好きなチャンネルを推薦する' },
] as const;
export type ApplicantType = (typeof APPLICANT_TYPES)[number]['value'];

export function isApplicantType(value: unknown): value is ApplicantType {
  return APPLICANT_TYPES.some((t) => t.value === value);
}

/** 管理画面で見せる申請者の種別 */
export const APPLICANT_TYPE_ADMIN_LABEL: Record<ApplicantType, string> = {
  creator: '本人・事務所の申請',
  viewer: '視聴者の推薦',
};

/** 申請の理由の上限（任意） */
export const MAX_APPLICATION_REASON_LENGTH = 200;

/** 1人1日（日本時間）あたりの申請数の上限（仕様書 §8） */
export const DAILY_APPLICATION_LIMIT = 5;

/**
 * 申請画面でのチャンネルの状態（仕様書 §4「受け付けないチャンネル」）。
 * - `ok`: 申請できる（未登録・未特定・確認待ち・掲載しない（excluded））
 * - `listed`: 既に掲載中（active）
 * - `opted_out`: 掲載を止めている（理由は出さない）
 * - `pending`: 審査中の申請がある（自分・他の人を問わない。2026-11-04 ユーザー決定）
 */
export type ApplyChannelState = 'ok' | 'listed' | 'opted_out' | 'pending';

/** チャンネル申請の見送り理由（定型。審査ワークフロー仕様書 §15.4）。選んだ文言を申請者への通知と提案履歴に出す */
export const CHANNEL_APPLICATION_REJECT_REASONS = [
  { code: 'not_official', label: '実況者本人・公式のチャンネルではない（切り抜き・転載・まとめなど）' },
  { code: 'few_game_playlists', label: 'ゲーム実況の再生リストがほとんどない' },
  { code: 'duplicate', label: 'すでに掲載中、または同じチャンネルの申請が審査中' },
  { code: 'unavailable', label: 'チャンネルが見つからない・非公開' },
  { code: 'other', label: 'その他（掲載の基準に合わない）' },
] as const;

export function channelApplicationRejectReasonLabel(code: unknown): string | null {
  return CHANNEL_APPLICATION_REJECT_REASONS.find((r) => r.code === code)?.label ?? null;
}

/** 掲載チャンネル（`exploration_channels.status`）の管理画面での表示名 */
export const EXPLORATION_STATUS_LABEL: Record<string, string> = {
  unresolved: '未特定（名前だけ登録）',
  pending_confirm: '確認待ち（名前から候補を探した）',
  active: '掲載中',
  excluded: '掲載しない',
  opted_out: '掲載停止（本人・事務所の申し出）',
};
