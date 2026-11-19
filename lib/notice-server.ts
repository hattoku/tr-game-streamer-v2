// 運営からのお知らせ（管理 お知らせ管理仕様書 v2.0）のサーバー側処理。サーバー専用（API Route からのみ import すること）。
//
// - notices は Firestore ルールでクライアントからは管理者しか読めない（備考 memo を利用者に見せないため、§4.2）。
//   利用者向けの読み込みはこのファイルの関数を API（/api/notices/*）から呼び、公開中のものだけを備考などを除いて返す。
// - 書き込みはすべて管理 API（/api/admin/notices/*）からこのファイルの関数で行う。
// - ベル通知（§4.3、決定6）: 初めて公開したとき notifyBell が ON なら、その時点の会員それぞれに notifications を1件ずつ作る。
//   1件につき1回だけ（bellSentAt を先にトランザクションで立ててから書く）。直しても・非公開→再公開でも作り直さない（決定2）。
// - 画像（§4.2）: Cloud Storage の `notices/{20文字}.webp`。横幅を最大1200pxに縮めた WebP に描き直す（メタデータは残さない）。
//   ファイル名は推測できない長さなので、配信 API はファイルがあれば返す（下書きのプレビューでも同じ URL で見られるように）。
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { getStorage } from 'firebase-admin/storage';
import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';
import { adminApp, adminDb } from './firebase-admin';
import {
  NOTICE_IMAGE_BYTES_MAX,
  NOTICE_IMAGE_FILE_NAME_RE,
  NOTICE_IMAGE_WIDTH_MAX,
  NOTICE_PAGE_SIZE,
  isImportantActive,
  isNoticeAttachmentType,
  noticeImageUrl,
  parseYoutubeVideoId,
  validateNoticeInput,
  type NoticeAttachmentType,
  type NoticeImageErrorCode,
  type NoticeInput,
  type NoticeInputErrors,
  type NoticeStatus,
  type PublicNotice,
} from './notice-shared';

const notices = () => adminDb.collection('notices');

function toMillis(value: unknown): number | null {
  const ms = (value as { toMillis?: () => number } | null | undefined)?.toMillis?.();
  return typeof ms === 'number' ? ms : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 保存されたお知らせを利用者向けの形にする（備考・作成者などは含めない） */
export function toPublicNotice(snap: DocumentSnapshot<DocumentData>, now: number = Date.now()): PublicNotice {
  const d = snap.data() ?? {};
  const attachmentType: NoticeAttachmentType = isNoticeAttachmentType(d.attachmentType) ? d.attachmentType : 'none';
  const hasLink = attachmentType === 'link' || attachmentType === 'image_link';
  const imageFileName = attachmentType === 'image_link' && typeof d.imageFileName === 'string' ? d.imageFileName : null;
  return {
    id: snap.id,
    title: str(d.title),
    body: str(d.body),
    attachmentType,
    linkLabel: hasLink ? str(d.linkLabel) || null : null,
    linkUrl: hasLink ? str(d.linkUrl) || null : null,
    imageUrl: imageFileName ? noticeImageUrl(imageFileName) : null,
    youtubeVideoId: attachmentType === 'youtube' ? str(d.youtubeVideoId) || null : null,
    important: isImportantActive({ important: d.important === true, importantUntil: toMillis(d.importantUntil) }, now),
    publishedAt: toMillis(d.publishedAt) ?? 0,
  };
}

// ---------------------------------------------------------------------------
// 利用者向けの読み込み（§7・§8）
// ---------------------------------------------------------------------------

/** 公開中のお知らせを公開日の新しい順に。`before` は前のページの最後の公開日（ミリ秒） */
export async function listPublishedNotices(limit: number, before: number | null): Promise<{ notices: PublicNotice[]; hasMore: boolean }> {
  const size = Math.min(Math.max(1, Math.floor(limit)), NOTICE_PAGE_SIZE);
  let q = notices().where('status', '==', 'published').orderBy('publishedAt', 'desc');
  if (before !== null) q = q.startAfter(new Date(before));
  const snap = await q.limit(size + 1).get();
  const now = Date.now();
  const docs = snap.docs.slice(0, size);
  return { notices: docs.map((d) => toPublicNotice(d, now)), hasMore: snap.docs.length > size };
}

/** 重要エリアに今出すもの（新しい順、§7.1） */
export async function listImportantNotices(): Promise<PublicNotice[]> {
  const snap = await notices().where('status', '==', 'published').where('important', '==', true).get();
  const now = Date.now();
  return snap.docs
    .map((d) => toPublicNotice(d, now))
    .filter((n) => n.important)
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

/** 公開中の1件。非公開・下書き・存在しないものは null */
export async function getPublishedNotice(id: string): Promise<PublicNotice | null> {
  if (!id || id.includes('/')) return null;
  const snap = await notices().doc(id).get();
  if (!snap.exists || snap.data()?.status !== 'published') return null;
  return toPublicNotice(snap);
}

// ---------------------------------------------------------------------------
// 管理（§5・§6）
// ---------------------------------------------------------------------------

export class NoticeError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly errors?: NoticeInputErrors,
  ) {
    super(code);
  }
}

export function noticeErrorResponse(e: unknown): NextResponse {
  if (e instanceof NoticeError) return NextResponse.json({ error: e.code, ...(e.errors ? { errors: e.errors } : {}) }, { status: e.status });
  throw e;
}

/** API に届いた JSON を NoticeInput にする（型の合わないものは空にする。中身のチェックは validateNoticeInput） */
export function parseNoticeInput(raw: unknown): NoticeInput | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isNoticeAttachmentType(r.attachmentType)) return null;
  const until = typeof r.importantUntil === 'number' && Number.isFinite(r.importantUntil) ? r.importantUntil : null;
  const imageFileName = typeof r.imageFileName === 'string' && NOTICE_IMAGE_FILE_NAME_RE.test(r.imageFileName) ? r.imageFileName : null;
  return {
    title: str(r.title),
    body: str(r.body),
    attachmentType: r.attachmentType,
    linkLabel: str(r.linkLabel),
    linkUrl: str(r.linkUrl),
    imageFileName,
    youtubeUrl: str(r.youtubeUrl),
    notifyBell: r.notifyBell === true,
    important: r.important === true,
    importantUntil: r.important === true ? until : null,
    memo: str(r.memo),
  };
}

/** 入力を保存する形にする。添付の種類で使わない項目は空にする（§4.1） */
function toStoredFields(input: NoticeInput) {
  const type = input.attachmentType;
  const hasLink = type === 'link' || type === 'image_link';
  return {
    title: input.title.trim(),
    body: input.body.trim(),
    attachmentType: type,
    linkLabel: hasLink ? input.linkLabel.trim() : '',
    linkUrl: hasLink ? input.linkUrl.trim() : '',
    imageFileName: type === 'image_link' ? input.imageFileName : null,
    youtubeVideoId: type === 'youtube' ? parseYoutubeVideoId(input.youtubeUrl) : null,
    youtubeUrl: type === 'youtube' ? input.youtubeUrl.trim() : '',
    important: input.important,
    importantUntil: input.important && input.importantUntil !== null ? new Date(input.importantUntil) : null,
    memo: input.memo.trim(),
  };
}

function storedImportantUntil(data: DocumentData | undefined): number | null {
  const v = data?.importantUntil;
  return v && typeof v.toMillis === 'function' ? (v.toMillis() as number) : null;
}

function assertValid(input: NoticeInput, mode: 'draft' | 'publish', savedImportantUntil: number | null = null) {
  const errors = validateNoticeInput(input, mode, Date.now(), savedImportantUntil);
  if (Object.keys(errors).length > 0) throw new NoticeError('invalid_input', 400, errors);
}

/** 下書きで作る（§5） */
export async function createNoticeDraft(uid: string, input: NoticeInput): Promise<string> {
  assertValid(input, 'draft');
  const now = new Date();
  const ref = notices().doc();
  await ref.set({
    ...toStoredFields(input),
    notifyBell: input.notifyBell,
    status: 'draft' satisfies NoticeStatus,
    publishedAt: null,
    bellSentAt: null,
    bellSentCount: null,
    createdBy: uid,
    updatedBy: uid,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

/**
 * 保存（§5）。下書きは書きかけでもよい（タイトルだけ必須）。公開中・非公開はすべて揃っていないと保存できない
 * （公開中は保存すると利用者にすぐ見えるため。非公開はもう一度公開するときに崩れていないように）。
 * ベル通知は公開した後は変えられない（作った通知と食い違わないように）。
 */
export async function saveNotice(id: string, uid: string, input: NoticeInput): Promise<void> {
  const ref = notices().doc(id);
  const oldImage = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new NoticeError('not_found', 404);
    const status = snap.data()!.status as NoticeStatus;
    assertValid(input, status === 'draft' ? 'draft' : 'publish', storedImportantUntil(snap.data()));
    const fields = toStoredFields(input);
    tx.update(ref, {
      ...fields,
      ...(status === 'draft' ? { notifyBell: input.notifyBell } : {}),
      updatedBy: uid,
      updatedAt: new Date(),
    });
    const prev = typeof snap.data()!.imageFileName === 'string' ? (snap.data()!.imageFileName as string) : null;
    return prev && prev !== fields.imageFileName ? prev : null;
  });
  await deleteNoticeImage(oldImage);
}

/**
 * 公開する／もう一度公開する（§5）。編集画面の今の入力をあわせて保存する。
 * 初めての公開で notifyBell が ON なら、その時点の会員にベル通知を作る。作った人数を返す（作らなかったら null）。
 */
export async function publishNotice(id: string, uid: string, input: NoticeInput): Promise<{ bellSentCount: number | null }> {
  const ref = notices().doc(id);
  const now = new Date();
  const { sendBell, title, oldImage } = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new NoticeError('not_found', 404);
    const data = snap.data()!;
    if (data.status === 'published') throw new NoticeError('already_published', 409);
    assertValid(input, 'publish', storedImportantUntil(data));
    const isFirst = data.status === 'draft';
    const notifyBell = isFirst ? input.notifyBell : data.notifyBell === true;
    const sendBell = isFirst && notifyBell && !data.bellSentAt;
    const fields = toStoredFields(input);
    tx.update(ref, {
      ...fields,
      notifyBell,
      status: 'published' satisfies NoticeStatus,
      publishedAt: data.publishedAt ?? now,
      ...(sendBell ? { bellSentAt: now } : {}),
      updatedBy: uid,
      updatedAt: now,
    });
    const prev = typeof data.imageFileName === 'string' ? (data.imageFileName as string) : null;
    return { sendBell, title: fields.title, oldImage: prev && prev !== fields.imageFileName ? prev : null };
  });
  await deleteNoticeImage(oldImage);
  if (!sendBell) return { bellSentCount: null };
  let count: number;
  try {
    count = await createNoticeBellNotifications(id, title, now);
  } catch (e) {
    // 途中で失敗したら下書きに戻し、もう一度「公開する」でやり直せるようにする。
    // 通知のIDは「お知らせ×会員」で決まっているので、やり直しても同じ人に2通届かない
    console.error('[notices] bell fan-out failed', id, e);
    await ref.update({ status: 'draft' satisfies NoticeStatus, publishedAt: null, bellSentAt: null, updatedAt: new Date() });
    throw new NoticeError('bell_failed', 500);
  }
  await ref.update({ bellSentCount: count });
  return { bellSentCount: count };
}

/**
 * その時点の会員それぞれにベル通知を作る（§4.3）。AI 運営者のアカウントには作らない。
 * 通知のIDを notice_{お知らせID}_{会員ID} に決めておき、失敗してやり直しても重ならないようにする
 */
async function createNoticeBellNotifications(noticeId: string, title: string, createdAt: Date): Promise<number> {
  const users = await adminDb.collection('users').select('isAI').get();
  const targets = users.docs.filter((u) => u.data().isAI !== true).map((u) => u.id);
  for (let i = 0; i < targets.length; i += 450) {
    const batch = adminDb.batch();
    for (const userId of targets.slice(i, i + 450)) {
      batch.set(adminDb.collection('notifications').doc(`notice_${noticeId}_${userId}`), {
        userId,
        type: 'notice',
        noticeId,
        message: title,
        isRead: false,
        createdAt,
      });
    }
    await batch.commit();
  }
  return targets.length;
}

/** 非公開にする（§5）。届いたベルの通知は残す（開くと「公開を終了しました」） */
export async function unpublishNotice(id: string, uid: string): Promise<void> {
  const ref = notices().doc(id);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new NoticeError('not_found', 404);
    if (snap.data()!.status !== 'published') throw new NoticeError('not_published', 409);
    tx.update(ref, { status: 'unpublished' satisfies NoticeStatus, updatedBy: uid, updatedAt: new Date() });
  });
}

/** 下書きの削除（§5）。公開したもの（公開中・非公開）は履歴として残すので消せない */
export async function deleteNoticeDraft(id: string): Promise<void> {
  const ref = notices().doc(id);
  const image = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new NoticeError('not_found', 404);
    if (snap.data()!.status !== 'draft') throw new NoticeError('not_draft', 409);
    tx.delete(ref);
    return typeof snap.data()!.imageFileName === 'string' ? (snap.data()!.imageFileName as string) : null;
  });
  await deleteNoticeImage(image);
}

// ---------------------------------------------------------------------------
// 画像（§4.2・§6.3）
// ---------------------------------------------------------------------------

const PIXELS_MAX = 40_000_000;
export const NOTICE_IMAGE_REQUEST_BYTES_MAX = NOTICE_IMAGE_BYTES_MAX + 256 * 1024;
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const bucket = () => getStorage(adminApp).bucket();
const imagePath = (fileName: string) => `notices/${fileName}`;

export class NoticeImageError extends Error {
  constructor(readonly code: NoticeImageErrorCode) {
    super(code);
  }
}

type Format = 'png' | 'jpeg' | 'webp';

function detectFormat(buf: Buffer): Format | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** 検査して、横幅最大1200px の WebP に描き直す（形式は先頭バイトで判定。プロフィール画像と同じ方針） */
async function processNoticeImage(file: File): Promise<Buffer> {
  if (file.size > NOTICE_IMAGE_BYTES_MAX) throw new NoticeImageError('image_size');
  const buf = Buffer.from(await file.arrayBuffer());
  const format = detectFormat(buf);
  if (!format) throw new NoticeImageError('image_type');
  const input = { limitInputPixels: PIXELS_MAX, failOn: 'error' as const };
  try {
    const meta = await sharp(buf, input).metadata();
    if (meta.format !== format) throw new NoticeImageError('image_unreadable');
    return await sharp(buf, input).autoOrient().resize({ width: NOTICE_IMAGE_WIDTH_MAX, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch (e) {
    if (e instanceof NoticeImageError) throw e;
    throw new NoticeImageError('image_unreadable');
  }
}

/** 画像を保存してファイル名を返す。お知らせへの紐づけは保存・公開のときに imageFileName で行う */
export async function uploadNoticeImage(file: File): Promise<string> {
  const data = await processNoticeImage(file);
  const fileName = `${Array.from(randomBytes(20), (b) => ID_CHARS[b % ID_CHARS.length]).join('')}.webp`;
  await bucket().file(imagePath(fileName)).save(data, { contentType: 'image/webp', resumable: false, metadata: { cacheControl: 'private, no-store' } });
  return fileName;
}

/** 消せなくても例外にしない（取り残した分はどこからも参照されない） */
export async function deleteNoticeImage(fileName: string | null): Promise<void> {
  if (!fileName || !NOTICE_IMAGE_FILE_NAME_RE.test(fileName)) return;
  await bucket()
    .file(imagePath(fileName))
    .delete({ ignoreNotFound: true })
    .catch((e) => console.error(`[notice-image] notices/${fileName} を削除できませんでした`, e));
}

export async function serveNoticeImage(fileName: string): Promise<NextResponse> {
  const notFound = NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!NOTICE_IMAGE_FILE_NAME_RE.test(fileName)) return notFound;
  let data: Buffer;
  try {
    [data] = await bucket().file(imagePath(fileName)).download();
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
      // ファイル名は保存のたびに変わるので端末には長めにキャッシュさせる（CDN には置かせない。ユーザーアイコンと同じ）
      'Cache-Control': 'private, max-age=604800',
    },
  });
}

