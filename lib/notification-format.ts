// 通知の表示用の小さな整形（ページ ユーザー通知機能仕様書 §2.1 再生リスト新着通知）

/** 「#6 〇〇〇〇」「#6 〇〇〇〇 ほか1本」。増えた動画が分からない古い通知は null */
export function formatNewVideos(titles: string[], count: number): string | null {
  if (titles.length === 0) return null;
  const rest = Math.max(count, titles.length) - 1;
  return rest > 0 ? `${titles[0]} ほか${rest}本` : titles[0];
}

/**
 * 通知の出し分け（ページ ユーザー通知機能仕様書 §1.2・§4.1、v1.6）。
 * お問い合わせ返信・審査結果は一部の人しか使わない機能なので、通知一覧・ベルには出さず、
 * ヘッダーのユーザーアイコンの件数と、メニューの「お問い合わせ履歴」「提案履歴」の未読数で知らせる。
 */
export const ACCOUNT_NOTIFICATION_TYPES = ['inquiry_reply', 'review_result'] as const;
export type AccountNotificationType = (typeof ACCOUNT_NOTIFICATION_TYPES)[number];

/** 通知一覧・ベルに出す種別か（お問い合わせ返信・審査結果以外。種別のない古い通知は再生リスト新着として扱う） */
export function isFeedNotification(type: unknown): boolean {
  return !(ACCOUNT_NOTIFICATION_TYPES as readonly unknown[]).includes(type);
}
