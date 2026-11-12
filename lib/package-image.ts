// ゲームのパッケージ画像（games.packageImageUrl）を、表示する大きさに合った解像度で読み込むための
// クライアント/サーバー共用ヘルパー。
//
// 楽天ブックスAPIの largeImageUrl は `https://thumbnail.image.rakuten.co.jp/...jpg?_ex=200x200` の形で、
// 楽天の画像サーバーが「200×200の枠に収まる大きさ」（縦長パッケージなら約123×200px）に縮小して返す。
// 当時のスマホのゲームタイトル詳細ページは画像を横幅いっぱい（画面密度3倍で900px前後）に出しており、
// 7倍ほど引き伸ばされて粗く見えていた（2026-11-11）。
// `_ex` の数字を変えるだけで楽天は大きい画像を返す（400x400→247×400、600x600→370×600、1000x1000→617×1000で元画像とほぼ同じ）。
//
// 保存済みのURLは書き換えず表示のたびにここで差し替える方式にしている（アフィリエイトリンクの
// lib/rakuten-affiliate.ts と同じ考え方）。これなら既存のゲームもデータ移行なしで直り、表示サイズを
// 変えたくなったときもここだけ直せばよい。楽天以外のURL（手入力の画像URL）はそのまま返す。

const RAKUTEN_THUMBNAIL_HOST = 'thumbnail.image.rakuten.co.jp';

// 表示する場所ごとの `_ex` の値。縦長パッケージは高さ側で枠に当たるため、実際の横幅は値の約0.62倍になる
// - detail: ゲームタイトル詳細ページ（スマホは幅112px、PCは幅200px。2026-11-12 にスマホの全幅表示をやめた）。370×600px
// - card:   一覧カード・関連ゲーム（幅88〜96px）。247×400px で画面密度3倍でも足りる
export const PACKAGE_IMAGE_SIZES = {
  detail: '600x600',
  card: '400x400',
} as const;

export type PackageImageSize = keyof typeof PACKAGE_IMAGE_SIZES;

export function packageImageSrc(url: string, size: PackageImageSize): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.hostname !== RAKUTEN_THUMBNAIL_HOST) return url;
  parsed.searchParams.set('_ex', PACKAGE_IMAGE_SIZES[size]);
  return parsed.toString();
}
