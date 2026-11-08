// 人気のチャンネルの集計（リブランディング段階5）のクライアント・サーバー共用部分。
// 仕様: 共通 人気のチャンネル 集計 仕様書。集計は lib/popularity-server.ts、並べ替えは lib/catalog-server.ts。

/** 直近とみなす日数（§2.1） */
export const RECENT_DAYS = 30;

/**
 * 重み（§2.2、仮の値。友人テストの結果を見て直す）。保存しているのは人数なので、
 * ここを変えれば次に読んだときから新しい点数で並ぶ。
 */
export const POPULARITY_WEIGHTS = {
  mylist: 1,
  review: 1,
  viewer: 1,
} as const;

/** 直近30日の人への加点（1 なら直近の人は2人分） */
export const RECENT_BONUS = 1;

/** `channels.popularity` に保存する人数（§4）。同じ人は1人として数えたもの */
export interface PopularityCounts {
  mylistUsers: number;
  reviewUsers: number;
  viewerUsers: number;
  recentMylistUsers: number;
  recentReviewUsers: number;
  recentViewerUsers: number;
}

export const ZERO_POPULARITY: PopularityCounts = {
  mylistUsers: 0,
  reviewUsers: 0,
  viewerUsers: 0,
  recentMylistUsers: 0,
  recentReviewUsers: 0,
  recentViewerUsers: 0,
};

const COUNT_KEYS = Object.keys(ZERO_POPULARITY) as Array<keyof PopularityCounts>;

/** Firestore の値を人数として読む（無い・壊れている項目は0） */
export function readPopularity(value: unknown): PopularityCounts {
  const raw = (value ?? {}) as Record<string, unknown>;
  const out = { ...ZERO_POPULARITY };
  for (const key of COUNT_KEYS) {
    const n = raw[key];
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

export function samePopularity(a: PopularityCounts, b: PopularityCounts): boolean {
  return COUNT_KEYS.every((key) => a[key] === b[key]);
}

/** 人気の点数（§2.2） */
export function popularityScore(c: PopularityCounts): number {
  const part = (total: number, recent: number) => total + RECENT_BONUS * recent;
  return (
    POPULARITY_WEIGHTS.mylist * part(c.mylistUsers, c.recentMylistUsers) +
    POPULARITY_WEIGHTS.review * part(c.reviewUsers, c.recentReviewUsers) +
    POPULARITY_WEIGHTS.viewer * part(c.viewerUsers, c.recentViewerUsers)
  );
}

/** 集計 API の応答 */
export interface PopularityRunSummary {
  /** 集計したチャンネル数（掲載中の再生リストがあるもの） */
  processedCount: number;
  /** 数字を書き直したチャンネル数 */
  updatedChannelCount: number;
  /** 新しく作った playlist_viewers の数 */
  newViewerCount: number;
  computedAt: number;
}
