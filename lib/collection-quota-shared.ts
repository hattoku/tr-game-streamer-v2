// コンテンツ収集のクォータ上限と日付の区切り（サーバー・管理画面で共用。管理_Ai運営者 コンテンツ収集機能仕様書 v3.0 §6）。
// 上限は YouTube の1日10,000ユニットのうち、既存の新着動画取得（最大約2,000ユニット/回）の分を残した値。
export const COLLECTION_DAILY_QUOTA_LIMIT = 6000;

/** 名前からチャンネルを特定する1件あたりの消費（search.list 100 + channels.list 1） */
export const NAME_SEARCH_COST = 101;

/** YouTube のクォータは太平洋時間の0時にリセットされるが、運用上わかりやすい日本時間の日付で区切る */
export function todayJst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
