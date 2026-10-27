// お問い合わせの添付画像のサーバー側処理（ページ お問い合わせフォーム仕様書 §9、Firestore データモデル設計書 §3.17・§3.31）。
// サーバー専用（API Route からのみ import すること）。
//
// - 形式はブラウザが申告する MIME・拡張子を信じず、先頭バイトで判定する（§9.5）
// - sharp で描き直して保存する（メタデータ除去・向きの反映・長辺4,096px以内）。元ファイルのバイト列は保存しない
// - 保存先は Cloud Storage の `inquiries/{inquiryId}/{id}.{ext}`。storage.rules でクライアントからは読み書きできない
// - 1日の上限（ユーザーごとに20枚）は inquiry_upload_counters をお問い合わせの書き込みと同じトランザクションで加算して守る
import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getStorage } from 'firebase-admin/storage';
import type { Transaction } from 'firebase-admin/firestore';
import { adminApp, adminDb } from './firebase-admin';
import { readJsonObject } from './collections-server';
import {
  INQUIRY_ATTACHMENTS_DAILY_MAX,
  INQUIRY_ATTACHMENTS_MAX,
  INQUIRY_ATTACHMENT_BYTES_MAX,
  INQUIRY_ATTACHMENT_EXTENSIONS,
  inquiryAttachmentFileName,
  parseInquiryAttachments,
  type InquiryAttachmentErrorCode,
  type InquiryAttachmentFormat,
} from './inquiry-shared';

/** 1枚の画素数の上限（§9.2、解凍爆弾対策） */
const PIXELS_MAX = 40_000_000;
/** 保存時の長辺の上限（§9.5） */
const LONG_EDGE_MAX = 4096;
/** 添付画像の保存期間（対応済みから180日、管理 お問い合わせ管理仕様書 §6） */
const RETENTION_DAYS = 180;
/** multipart 全体の上限。画像3枚分に本文などの余裕を足したもの。超えたら解析せずに断る */
const REQUEST_BYTES_MAX = INQUIRY_ATTACHMENTS_MAX * INQUIRY_ATTACHMENT_BYTES_MAX + 1024 * 1024;

const CONTENT_TYPES: Record<InquiryAttachmentFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
const FILE_NAME_RE = /^[A-Za-z0-9]{20}\.(png|jpg|webp)$/;
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export class InquiryAttachmentError extends Error {
  constructor(readonly code: InquiryAttachmentErrorCode) {
    super(code);
  }
}

export function attachmentErrorResponse(code: InquiryAttachmentErrorCode): NextResponse {
  return NextResponse.json({ error: code }, { status: code === 'attachment_daily_limit' ? 429 : 400 });
}

/** Firestore に保存する添付情報（§3.17「添付画像」） */
export interface StoredInquiryAttachment {
  id: string;
  format: InquiryAttachmentFormat;
  width: number;
  height: number;
  size: number;
  deletedAt: Date | null;
}

interface ProcessedImage {
  attachment: StoredInquiryAttachment;
  data: Buffer;
}

const bucket = () => getStorage(adminApp).bucket();
const storagePath = (inquiryId: string, fileName: string) => `inquiries/${inquiryId}/${fileName}`;

/**
 * JSON（従来の送信）と multipart/form-data（画像あり。本文は `payload` に JSON 文字列、画像は `images`）の両方を受ける。
 * 本文が読めなければ null。画像の枚数・サイズはここで確かめる（中身の検査は processInquiryImages）。
 */
export async function readInquiryRequest(
  request: NextRequest,
): Promise<{ body: Record<string, unknown>; files: File[] } | { errorResponse: NextResponse } | null> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    const body = await readJsonObject(request);
    return body ? { body, files: [] } : null;
  }
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > REQUEST_BYTES_MAX) return { errorResponse: attachmentErrorResponse('attachment_size') };

  const form = await request.formData().catch(() => null);
  if (!form) return null;
  const payload = form.get('payload');
  let body: unknown = null;
  try {
    body = typeof payload === 'string' ? JSON.parse(payload) : null;
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const files = form.getAll('images').filter((v): v is File => typeof v === 'object' && v !== null && 'arrayBuffer' in v);
  if (files.length > INQUIRY_ATTACHMENTS_MAX) return { errorResponse: attachmentErrorResponse('attachment_count') };
  if (files.some((f) => f.size > INQUIRY_ATTACHMENT_BYTES_MAX)) return { errorResponse: attachmentErrorResponse('attachment_size') };
  return { body: body as Record<string, unknown>, files };
}

/** 先頭バイトで形式を判定する（§9.5）。PNG・JPEG・WebP 以外は null */
function detectFormat(buf: Buffer): InquiryAttachmentFormat | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function randomId(): string {
  // 256 は 62 で割り切れないので偏るが、推測されにくさには影響しない程度（20文字）
  return Array.from(randomBytes(20), (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}

async function reencode(buf: Buffer, format: InquiryAttachmentFormat): Promise<ProcessedImage> {
  const input = { limitInputPixels: PIXELS_MAX, failOn: 'error' as const };
  // 先頭バイトの判定と、デコーダーが認識した形式が食い違うものは受け付けない
  const meta = await sharp(buf, input).metadata();
  if (meta.format !== format) throw new InquiryAttachmentError('attachment_unreadable');

  // メタデータは withMetadata/keepMetadata を呼ばない限りすべて除かれる。向きだけ先に画素へ反映する。
  // アニメーションは1枚目のみ（sharp の既定）
  const pipeline = sharp(buf, input)
    .autoOrient()
    .resize({ width: LONG_EDGE_MAX, height: LONG_EDGE_MAX, fit: 'inside', withoutEnlargement: true });
  if (format === 'png') pipeline.png({ compressionLevel: 9 });
  else if (format === 'jpeg') pipeline.jpeg({ quality: 85, mozjpeg: true });
  else pipeline.webp({ quality: 85 });
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    data,
    attachment: { id: randomId(), format, width: info.width, height: info.height, size: data.length, deletedAt: null },
  };
}

/** 全部が通ったときだけ返す（1枚でも駄目なら InquiryAttachmentError、§9.4） */
export async function processInquiryImages(files: File[]): Promise<ProcessedImage[]> {
  const result: ProcessedImage[] = [];
  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const format = detectFormat(buf);
    if (!format) throw new InquiryAttachmentError('attachment_type');
    try {
      result.push(await reencode(buf, format));
    } catch (e) {
      if (e instanceof InquiryAttachmentError) throw e;
      // 壊れたファイル・画素数の上限超え（sharp の例外）
      throw new InquiryAttachmentError('attachment_unreadable');
    }
  }
  return result;
}

/** Storage に置く。途中で失敗したら置いた分を消して例外を投げ直す */
export async function uploadInquiryImages(inquiryId: string, images: ProcessedImage[]): Promise<StoredInquiryAttachment[]> {
  const uploaded: string[] = [];
  try {
    for (const { data, attachment } of images) {
      const fileName = inquiryAttachmentFileName(attachment);
      await bucket()
        .file(storagePath(inquiryId, fileName))
        .save(data, { contentType: CONTENT_TYPES[attachment.format], resumable: false, metadata: { cacheControl: 'private, no-store' } });
      uploaded.push(fileName);
    }
  } catch (e) {
    await deleteInquiryImages(inquiryId, uploaded);
    throw e;
  }
  return images.map((i) => i.attachment);
}

/** 書き込みに失敗したときの後始末。消せなくても例外にしない */
export async function deleteInquiryImages(inquiryId: string, fileNames: string[]): Promise<void> {
  await Promise.all(
    fileNames.map((name) =>
      bucket()
        .file(storagePath(inquiryId, name))
        .delete({ ignoreNotFound: true })
        .catch(() => undefined),
    ),
  );
}

/** 日本時間の YYYYMMDD（1日の上限の区切り、§9.2） */
function jstDateKey(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replaceAll('-', '');
}

/**
 * 1日の上限の早期チェック（アップロードの無駄を省くだけ。確定は reserveDailyQuota）。
 * 上限を超えるなら InquiryAttachmentError('attachment_daily_limit')
 */
export async function assertDailyQuota(uid: string, count: number, now: Date): Promise<void> {
  if (count === 0) return;
  const snap = await adminDb.collection('inquiry_upload_counters').doc(`${uid}_${jstDateKey(now)}`).get();
  const used = Number(snap.data()?.count ?? 0);
  if (used + count > INQUIRY_ATTACHMENTS_DAILY_MAX) throw new InquiryAttachmentError('attachment_daily_limit');
}

/**
 * トランザクション内で1日の枚数を加算する。上限を超えるなら false を返し、何も書かない。
 * トランザクションは読み取りを書き込みより先に済ませる必要があるため、他の書き込みより前に呼ぶこと
 */
export async function reserveDailyQuota(tx: Transaction, uid: string, count: number, now: Date): Promise<boolean> {
  if (count === 0) return true;
  const date = jstDateKey(now);
  const ref = adminDb.collection('inquiry_upload_counters').doc(`${uid}_${date}`);
  const used = Number((await tx.get(ref)).data()?.count ?? 0);
  if (used + count > INQUIRY_ATTACHMENTS_DAILY_MAX) return false;
  tx.set(ref, { userId: uid, date, count: used + count, updatedAt: now });
  return true;
}

/**
 * 閲覧 API の本体（§9.6）。権限の確認は呼び出し側で済ませておくこと。
 * ファイル名の形を確かめ、無ければ（削除済みを含む）404。ヘッダーで型を固定し、ブラウザに中身を推測・実行させない
 */
export async function serveInquiryAttachment(inquiryId: string, fileName: string): Promise<NextResponse> {
  const match = FILE_NAME_RE.exec(fileName);
  if (!match) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const format = (Object.keys(INQUIRY_ATTACHMENT_EXTENSIONS) as InquiryAttachmentFormat[]).find(
    (f) => INQUIRY_ATTACHMENT_EXTENSIONS[f] === match[1],
  )!;
  let data: Buffer;
  try {
    [data] = await bucket().file(storagePath(inquiryId, fileName)).download();
  } catch (e) {
    if ((e as { code?: number }).code === 404) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    throw e;
  }
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': CONTENT_TYPES[format],
      'Content-Length': String(data.length),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

/** 未削除の添付のファイル名 */
function activeFileNames(raw: unknown): string[] {
  return parseInquiryAttachments(raw)
    .filter((a) => !a.deleted)
    .map(inquiryAttachmentFileName);
}

/** 指定したファイル名の添付に削除日時を入れる */
function markDeleted(raw: unknown, fileNames: Set<string>, now: Date): unknown {
  if (!Array.isArray(raw)) return raw;
  return raw.map((a: Record<string, unknown>) => {
    const [parsed] = parseInquiryAttachments([a]);
    return parsed && fileNames.has(inquiryAttachmentFileName(parsed)) && a.deletedAt == null ? { ...a, deletedAt: now } : a;
  });
}

/**
 * 保存期間（対応済みから180日）を過ぎたお問い合わせの画像を消す（管理 お問い合わせ管理仕様書 §6）。
 * 先に読んだ時点の画像だけを名前で消し、その後のトランザクションで削除日時を入れる。
 * 間に再オープン・新しい添付があっても、新しい画像は消さず hasAttachments も残る
 */
export async function purgeExpiredInquiryAttachments(now: Date): Promise<{ inquiries: number; files: number; counters: number }> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const snap = await adminDb.collection('inquiries').where('hasAttachments', '==', true).where('resolvedAt', '<=', cutoff).get();

  let files = 0;
  for (const doc of snap.docs) {
    const messages = await doc.ref.collection('messages').get();
    const targets = new Set([
      ...activeFileNames(doc.data().attachments),
      ...messages.docs.flatMap((m) => activeFileNames(m.data().attachments)),
    ]);
    await deleteInquiryImages(doc.id, [...targets]);
    files += targets.size;

    await adminDb.runTransaction(async (tx) => {
      const inquiry = await tx.get(doc.ref);
      const latestMessages = await tx.get(doc.ref.collection('messages'));
      const inquiryAttachments = markDeleted(inquiry.data()?.attachments, targets, now);
      let remaining = activeFileNames(inquiryAttachments).length;
      latestMessages.docs.forEach((m) => {
        if (!Array.isArray(m.data().attachments) || m.data().attachments.length === 0) return;
        const updated = markDeleted(m.data().attachments, targets, now);
        remaining += activeFileNames(updated).length;
        tx.update(m.ref, { attachments: updated });
      });
      tx.update(doc.ref, { attachments: inquiryAttachments ?? [], hasAttachments: remaining > 0 });
    });
  }

  // 1日の上限のカウンターは7日より前のものを片付ける（データモデル設計書 §3.31）
  const old = jstDateKey(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const counters = await adminDb.collection('inquiry_upload_counters').where('date', '<', old).get();
  for (let i = 0; i < counters.docs.length; i += 400) {
    const batch = adminDb.batch();
    counters.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return { inquiries: snap.size, files, counters: counters.size };
}
