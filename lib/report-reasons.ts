/**
 * レビューコメント通報の理由選択肢（レビュー投稿機能仕様書「通報機能」節）。
 * 通報モーダル（components/reviews/ReportModal.tsx）と管理画面の通報詳細（app/admin/workflows/[workflowId]）
 * で共用する。
 */
export const REPORT_REASONS = [
  { value: 'spam', label: 'スパム・宣伝' },
  { value: 'harassment', label: '荒らし・嫌がらせ' },
  { value: 'inappropriate', label: '不適切な内容（暴力・差別など）' },
  { value: 'other', label: 'その他' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

export function reportReasonLabel(value: string | null | undefined): string {
  return REPORT_REASONS.find((r) => r.value === value)?.label ?? '不明';
}
