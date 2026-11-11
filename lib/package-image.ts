// ゲームのパッケージ画像（games.packageImageUrl）を、表示する大きさに合った解像度で読み込むための
// クライアント/サーバー共用ヘルパー。
//
// 楽天ブックスAPIの largeImageUrl は `https://thumbnail.image.rakuten.co.jp/...jpg?_ex=200x200` の形で、
// 楽天の画像サーバーが「200×200の枠に収まる大きさ」（縦長パッケージなら約123×200px）に縮小して返す。
// スマホのゲームタイトル詳細ページでは画像を横幅いっぱい（約300〜360px、画面密度3倍で900px前後）に
// 出すため、そのままでは7倍ほど引き伸ばされて粗く見えていた（2026-11-11）。
// `_ex` の数字を変えるだけで楽天は大きい画像を返す（400x400→247×400、1000x1000→617×1000で元画像とほぼ同じ）。
//
// 保存済みのURLは書き換えず表示のたびにここで差し替える方式にしている（アフィリエイトリンクの
// lib/rakuten-affiliate.ts と同じ考え方）。これなら既存のゲームもデータ移行なしで直り、表示サイズを
// 変えたくなったときもここだけ直せばよい。楽天以外のURL（手入力の画像URL）はそのまま返す。

const RAKUTEN_THUMBNAIL_HOST = 'thumbnail.image.rakuten.co.jp';

// 表示する場所ごとの `_ex` の値。縦長パッケージは高さ側で枠に当たるため、実際の横幅は値の約0.62倍になる
// - detail: ゲームタイトル詳細ページ（スマホは横幅いっぱい、PCは幅200px）。617×1000px ≒ 元画像
// - card:   一覧カード・関連ゲーム（幅88〜96px）。247×400px で画面密度3倍でも足りる
export const PACKAGE_IMAGE_SIZES = {
  detail: '1000x1000',
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
