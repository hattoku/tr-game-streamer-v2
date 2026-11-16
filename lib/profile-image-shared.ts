// プロフィール画像（ユーザーアイコン、ページ 設定 プロフィール仕様書 §9.2・§9.4・§9.5）のクライアント・サーバー共通の定義。
// 形式・サイズはお問い合わせの添付画像（ページ お問い合わせフォーム仕様書 §9.2）と同じ一般的な範囲に揃える。

/** 受け付ける形式。ファイル選択の accept とブラウザの事前チェックに使う。サーバーは MIME を信じず先頭バイトで判定する */
export const PROFILE_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
/** 1枚の上限（元ファイル） */
export const PROFILE_IMAGE_BYTES_MAX = 5 * 1024 * 1024;
/** 保存する画像の一辺（中央で正方形に切り抜いてこの大きさにする） */
export const PROFILE_IMAGE_SIZE = 256;

/** API のエラーコード → 画面の文言（§9.4） */
export const PROFILE_IMAGE_ERRORS = {
  image_type: 'PNG・JPEG・WebP の画像を選択してください',
  image_size: '5MB以内の画像を選択してください',
  image_unreadable: '画像を読み込めませんでした。別の画像を選択してください',
} as const;
export type ProfileImageErrorCode = keyof typeof PROFILE_IMAGE_ERRORS;

export function isProfileImageErrorCode(value: unknown): value is ProfileImageErrorCode {
  return typeof value === 'string' && value in PROFILE_IMAGE_ERRORS;
}

/** ブラウザで選んだ時点の確認。形式は申告された MIME で見る（サーバーは中身で判定し直す） */
export function checkProfileImageFile(file: { type: string; size: number }): ProfileImageErrorCode | null {
  if (!(PROFILE_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return 'image_type';
  if (file.size > PROFILE_IMAGE_BYTES_MAX) return 'image_size';
  return null;
}

/** 配信 URL のファイル名（`{20文字の英数字}.webp`）。保存のたびに名前が変わるので、URL ごと長期キャッシュできる */
export const PROFILE_IMAGE_FILE_NAME_RE = /^[A-Za-z0-9]{20}\.webp$/;

/** users.profileImageUrl に入れる値（このサイトの配信 API の相対 URL） */
export function profileImageUrl(userId: string, fileName: string): string {
  return `/api/users/${encodeURIComponent(userId)}/avatar/${fileName}`;
}

/** 自分のサイトの配信 URL なら、そのファイル名を返す（古い画像を消すときに使う）。それ以外は null */
export function profileImageFileNameFromUrl(userId: string, url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const prefix = `/api/users/${encodeURIComponent(userId)}/avatar/`;
  if (!url.startsWith(prefix)) return null;
  const name = url.slice(prefix.length);
  return PROFILE_IMAGE_FILE_NAME_RE.test(name) ? name : null;
}
