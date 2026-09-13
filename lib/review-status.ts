/**
 * レビューの視聴ステータス（ページ 再生リスト レビュー投稿機能 仕様書「視聴ステータス」節）。
 * mylist.watchStatus（components/ui/Chip.tsx）とは別概念（Firestore データモデル設計書 3.11節の
 * 設計注記）。"reviewing" のみ mylist 側に対応する値が無い。
 * クライアント・サーバー（API Route）の両方から参照するため 'use client' を付けない。
 */
export type ReviewWatchStatus = 'want_to_watch' | 'watching' | 'reviewing' | 'completed' | 'on_hold' | 'dropped';

export const REVIEW_WATCH_STATUS_LABEL: Record<ReviewWatchStatus, string> = {
  want_to_watch: '見たい',
  watching: '視聴中',
  reviewing: 'レビュー',
  completed: '完走',
  on_hold: '一時中断',
  dropped: '断念',
};

/** 主要3ステータス（仕様書: 「その他」は完走・一時中断・断念をグルーピング） */
export const REVIEW_PRIMARY_STATUSES: ReviewWatchStatus[] = ['want_to_watch', 'watching', 'reviewing'];
export const REVIEW_OTHER_STATUSES: ReviewWatchStatus[] = ['completed', 'on_hold', 'dropped'];

export const REVIEW_WATCH_STATUS_VALUES = new Set<string>([
  ...REVIEW_PRIMARY_STATUSES,
  ...REVIEW_OTHER_STATUSES,
]);

/**
 * mylist.watchStatus と共通の語彙を持つステータス（"reviewing" のみ対応が無い）。
 * レビュー投稿時のマイリスト自動登録で、未登録なら既定値 "want_to_watch" を使い、
 * 登録済みならこの一覧に含まれる値のときだけ mylist 側の状態も同期する。
 */
export const MYLIST_COMPATIBLE_REVIEW_STATUSES = new Set<string>([
  'want_to_watch',
  'watching',
  'completed',
  'on_hold',
  'dropped',
]);
