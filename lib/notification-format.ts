// 通知の表示用の小さな整形（ページ ユーザー通知機能仕様書 §2.1 再生リスト新着通知）

/** 「#6 〇〇〇〇」「#6 〇〇〇〇 ほか1本」。増えた動画が分からない古い通知は null */
export function formatNewVideos(titles: string[], count: number): string | null {
  if (titles.length === 0) return null;
  const rest = Math.max(count, titles.length) - 1;
  return rest > 0 ? `${titles[0]} ほか${rest}本` : titles[0];
}
