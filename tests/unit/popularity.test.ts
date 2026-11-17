// 人気のチャンネルの点数（lib/popularity-shared.ts）。共通 人気のチャンネル 集計 仕様書 §2.2・§4。
import { describe, expect, it } from 'vitest';
import { RECENT_BONUS, ZERO_POPULARITY, popularityScore, readPopularity, samePopularity } from '@/lib/popularity-shared';

describe('popularityScore（§2.2: 累計＋直近30日の加点）', () => {
  it('誰もいなければ0点', () => {
    expect(popularityScore(ZERO_POPULARITY)).toBe(0);
  });

  it('マイリスト・レビュー・視聴開始の人数を足し、直近の人はさらに加点する', () => {
    const counts = { mylistUsers: 3, reviewUsers: 2, viewerUsers: 5, recentMylistUsers: 1, recentReviewUsers: 0, recentViewerUsers: 2 };
    // 重みはどれも1・直近の加点は1（仮の値）: (3+1) + (2+0) + (5+2) = 13
    expect(RECENT_BONUS).toBe(1);
    expect(popularityScore(counts)).toBe(13);
  });

  it('直近の人が多いチャンネルは、累計が同じでも上になる', () => {
    const old = { ...ZERO_POPULARITY, mylistUsers: 10 };
    const fresh = { ...ZERO_POPULARITY, mylistUsers: 10, recentMylistUsers: 4 };
    expect(popularityScore(fresh)).toBeGreaterThan(popularityScore(old));
  });
});

describe('readPopularity（無い・壊れている項目は0）', () => {
  it('保存された人数をそのまま読む', () => {
    expect(readPopularity({ mylistUsers: 2, reviewUsers: 1, viewerUsers: 4, recentMylistUsers: 1, recentReviewUsers: 1, recentViewerUsers: 3 })).toEqual({
      mylistUsers: 2,
      reviewUsers: 1,
      viewerUsers: 4,
      recentMylistUsers: 1,
      recentReviewUsers: 1,
      recentViewerUsers: 3,
    });
  });

  it('値が無い・数でない・負・無限なら0', () => {
    expect(readPopularity(undefined)).toEqual(ZERO_POPULARITY);
    expect(readPopularity(null)).toEqual(ZERO_POPULARITY);
    expect(readPopularity({ mylistUsers: '3', reviewUsers: -1, viewerUsers: Infinity, recentMylistUsers: NaN })).toEqual(ZERO_POPULARITY);
  });

  it('知らない項目は読まない', () => {
    expect(readPopularity({ mylistUsers: 1, extra: 5 })).toEqual({ ...ZERO_POPULARITY, mylistUsers: 1 });
  });
});

describe('samePopularity（書き直しが要るかの判定）', () => {
  it('全項目が同じときだけ true', () => {
    expect(samePopularity({ ...ZERO_POPULARITY, viewerUsers: 1 }, { ...ZERO_POPULARITY, viewerUsers: 1 })).toBe(true);
    expect(samePopularity({ ...ZERO_POPULARITY, viewerUsers: 1 }, { ...ZERO_POPULARITY, recentViewerUsers: 1 })).toBe(false);
  });
});
