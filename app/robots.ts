import type { MetadataRoute } from 'next';

// 検証段階のため全ページを検索エンジンから除外する（layout.tsxのmetadata.robotsと対）。
// 正式公開時にDisallowを外すこと。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
