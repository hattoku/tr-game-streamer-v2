/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // 再生リストの提案とチャンネルの申請は「提案する」（/propose）に統合した（ページ 提案する 仕様書 §2）。
  // 古いリンク・ブックマークのため、旧URLはクエリを引き継いで転送する
  async redirects() {
    return [
      { source: '/playlists/new', destination: '/propose', permanent: false },
      { source: '/channels/apply', destination: '/propose?type=channel', permanent: false },
    ];
  },
};

module.exports = nextConfig;
