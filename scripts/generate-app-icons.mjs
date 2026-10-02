// PWA・ブラウザタブ用のアプリアイコン一式を、元画像（document/design/app-icon/premite-icon-source.jpg、
// 2048×2048・背景#121212・中央に赤い二重三角）から書き出す。生成物はコミットする前提で、
// 元画像を差し替えたときだけ再実行すればよい。
//
// 使い方:
//   npm run icons:generate
//
// 用途ごとに切り出し範囲（元画像の中心を基準にした正方形）を変えている:
//   - 通常用（manifest の purpose: any・apple-icon）: 1600px四方 → 三角が高さの約62%
//   - maskable用: 元画像そのまま → 三角が約48%で、Android の円形マスク（中央80%のセーフゾーン）に収まる
//   - favicon用: 1320px四方 → 16〜48pxでも形が潰れないよう三角を大きめにする
// sharp は ICO を書き出せないため、favicon.ico は PNG を埋め込む形式の ICO をここで組み立てる。
//
// iOS の PWA 起動スプラッシュ（apple-touch-startup-image）も書き出す。iOS は manifest からスプラッシュを
// 作らず、画面サイズに完全一致する画像が無いと白画面になるため、lib/apple-splash-screens.json の端末ごとに
// 「元画像の背景色のキャンバス中央に通常用アイコン」を置いた縦向き画像を作る（指定は app/layout.tsx）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'document/design/app-icon/premite-icon-source.jpg');
const SOURCE_SIZE = 2048;

const CROP_ANY = 1600;
const CROP_FAVICON = 1320;

// スプラッシュの背景色はアプリ本体（デザイントークン --color-bg-base）と揃え、起動後の切り替わりで明度が変わらないようにする。
// 元画像の背景（#121212）との差はアイコンの縁のぼかしで馴染ませる
const SPLASH_BACKGROUND = '#0f0f0f';
// スプラッシュ上のアイコン（通常用切り出し）の一辺。画面短辺に対する比率
const SPLASH_ICON_RATIO = 0.35;
const SPLASH_SCREENS = JSON.parse(readFileSync(join(root, 'lib/apple-splash-screens.json'), 'utf8'));

// 元画像の中心から cropSize 四方を切り出して outSize px に縮小した PNG バッファを返す。
// ICO に埋め込む PNG は RGBA でないとデコーダ（Next.js の画像処理等）が読めないため、rgba 指定でアルファを付ける
async function render(cropSize, outSize, { rgba = false } = {}) {
  const offset = Math.round((SOURCE_SIZE - cropSize) / 2);
  let image = sharp(SOURCE)
    .extract({ left: offset, top: offset, width: cropSize, height: cropSize })
    .resize(outSize, outSize, { kernel: 'lanczos3' });
  if (rgba) image = image.ensureAlpha();
  return image.png({ compressionLevel: 9 }).toBuffer();
}

// PNG埋め込み形式の ICO（ICONDIR + ICONDIRENTRY×n + PNGデータ）を組み立てる
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width（256は0で表す）
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette colors
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

function write(relPath, data) {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, data);
  console.log(`wrote ${relPath} (${data.length} bytes)`);
}

write('public/icons/icon-192x192.png', await render(CROP_ANY, 192));
write('public/icons/icon-512x512.png', await render(CROP_ANY, 512));
write('public/icons/icon-maskable-512x512.png', await render(SOURCE_SIZE, 512));
write('app/apple-icon.png', await render(CROP_ANY, 180));

const faviconSizes = [16, 32, 48];
const faviconImages = await Promise.all(
  faviconSizes.map(async (size) => ({ size, data: await render(CROP_FAVICON, size, { rgba: true }) })),
);
write('app/favicon.ico', buildIco(faviconImages));

for (const { width, height, ratio } of SPLASH_SCREENS) {
  const w = width * ratio;
  const h = height * ratio;
  const iconSize = Math.round(w * SPLASH_ICON_RATIO);
  // 元画像の背景はわずかにムラ（周辺減光・三角の光彩）があり、そのまま貼ると切り抜きの四角い縁が見えるため、
  // 円形グラデーションのアルファで縁をぼかしてから背景に重ねる
  const fade = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}">` +
      '<defs><radialGradient id="g"><stop offset="0.75" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="100%" height="100%" fill="url(#g)"/></svg>',
  );
  const icon = await sharp(await render(CROP_ANY, iconSize, { rgba: true }))
    .composite([{ input: fade, blend: 'dest-in' }])
    .png()
    .toBuffer();
  const splash = await sharp({ create: { width: w, height: h, channels: 3, background: SPLASH_BACKGROUND } })
    .composite([{ input: icon, left: Math.round((w - iconSize) / 2), top: Math.round((h - iconSize) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  write(`public/icons/splash/apple-splash-${w}x${h}.png`, splash);
}
