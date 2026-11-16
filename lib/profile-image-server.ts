// プロフィール画像（ユーザーアイコン、ページ 設定 プロフィール仕様書 §9.5、Firestore データモデル設計書 §3.1）のサーバー側処理。
// サーバー専用（API Route からのみ import すること）。
//
// - 形式はブラウザが申告する MIME・拡張子を信じず、先頭バイトで判定する（お問い合わせの添付画像と同じ方針）
// - sharp で描き直して保存する（向きの反映 → 中央で正方形に切り抜き → 256×256 の WebP。メタデータは残さない）
// - 保存先は Cloud Storage の `avatars/{userId}/{20文字}.webp`。storage.rules でクライアントからは読み書きできず、
//   配信は GET /api/users/[userId]/avatar/[fileName] が行う
// - 新しい画像に替えたら、または画像を外したら、前の画像は消す（1人1枚だけ残る）
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { getStorage } from 'firebase-admin/storage';
import { adminApp } from './firebase-admin';
import { PROFILE_IMAGE_BYTES_MAX, PROFILE_IMAGE_FILE_NAME_RE, PROFILE_IMAGE_SIZE, type ProfileImageErrorCode } from './profile-image-shared';

/** 画素数の上限（解凍爆弾対策。お問い合わせの添付画像と同じ） */
const PIXELS_MAX = 40_000_000;
/** multipart 全体の上限。画像1枚に余裕を足したもの。超えたら解析せずに断る */
export const PROFILE_IMAGE_REQUEST_BYTES_MAX = PROFILE_IMAGE_BYTES_MAX + 256 * 1024;
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export class ProfileImageError extends Error {
  constructor(readonly code: ProfileImageErrorCode) {
    super(code);
  }
}

export function profileImageErrorResponse(code: ProfileImageErrorCode): NextResponse {
  return NextResponse.json({ error: code }, { status: code === 'image_size' ? 413 : 400 });
}

const bucket = () => getStorage(adminApp).bucket();
const storagePath = (userId: string, fileName: string) => `avatars/${userId}/${fileName}`;

type Format = 'png' | 'jpeg' | 'webp';

/** 先頭バイトで形式を判定する。PNG・JPEG・WebP 以外は null */
function detectFormat(buf: Buffer): Format | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function randomId(): string {
  return Array.from(randomBytes(20), (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}

/** アップロードされた画像を検査して、保存用の 256×256 WebP に描き直す */
export async function processProfileImage(file: File): Promise<Buffer> {
  if (file.size > PROFILE_IMAGE_BYTES_MAX) throw new ProfileImageError('image_size');
  const buf = Buffer.from(await file.arrayBuffer());
  const format = detectFormat(buf);
  if (!format) throw new ProfileImageError('image_type');
  const input = { limitInputPixels: PIXELS_MAX, failOn: 'error' as const };
  try {
    // 先頭バイトの判定と、デコーダーが認識した形式が食い違うものは受け付けない
    const meta = await sharp(buf, input).metadata();
    if (meta.format !== format) throw new ProfileImageError('image_unreadable');
    // メタデータは keepMetadata 等を呼ばない限りすべて除かれる。向きだけ先に画素へ反映する。アニメーションは1枚目のみ（sharp の既定）
    return await sharp(buf, input)
      .autoOrient()
      .resize({ width: PROFILE_IMAGE_SIZE, height: PROFILE_IMAGE_SIZE, fit: 'cover', position: 'centre' })
      .webp({ quality: 85 })
      .toBuffer();
  } catch (e) {
    if (e instanceof ProfileImageError) throw e;
    // 壊れたファイル・画素数の上限超え（sharp の例外）
    throw new ProfileImageError('image_unreadable');
  }
}

/** Storage に置き、ファイル名を返す */
export async function uploadProfileImage(userId: string, data: Buffer): Promise<string> {
  const fileName = `${randomId()}.webp`;
  await bucket()
    .file(storagePath(userId, fileName))
    .save(data, { contentType: 'image/webp', resumable: false, metadata: { cacheControl: 'private, no-store' } });
  return fileName;
}

/** 消せなくても例外にしない（取り残した分はどこからも参照されず、配信 API も返さない） */
export async function deleteProfileImage(userId: string, fileName: string | null): Promise<void> {
  if (!fileName || !PROFILE_IMAGE_FILE_NAME_RE.test(fileName)) return;
  await bucket()
    .file(storagePath(userId, fileName))
    .delete({ ignoreNotFound: true })
    .catch((e) => console.error(`[profile-image] avatars/${userId}/${fileName} を削除できませんでした`, e));
}

/**
 * 配信 API の本体。現在のアイコンかどうか・BAN されていないかの確認は呼び出し側で済ませておくこと。
 * ファイル名は保存のたびに変わるため、端末には長めにキャッシュさせる（CDN には置かせない。stg のゲートを素通りさせないため）
 */
export async function serveProfileImage(userId: string, fileName: string): Promise<NextResponse> {
  const notFound = NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!PROFILE_IMAGE_FILE_NAME_RE.test(fileName)) return notFound;
  let data: Buffer;
  try {
    [data] = await bucket().file(storagePath(userId, fileName)).download();
  } catch (e) {
    if ((e as { code?: number }).code === 404) return notFound;
    throw e;
  }
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(data.length),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cache-Control': 'private, max-age=604800',
    },
  });
}
