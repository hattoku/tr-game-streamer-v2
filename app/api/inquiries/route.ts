import { NextRequest, NextResponse } from 'next/server';
import { getOptionalUid, requireUser } from '@/lib/api-auth';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import {
  InquiryAttachmentError,
  assertDailyQuota,
  attachmentErrorResponse,
  deleteInquiryImages,
  processInquiryImages,
  readInquiryRequest,
  reserveDailyQuota,
  uploadInquiryImages,
  type StoredInquiryAttachment,
} from '@/lib/inquiry-attachments-server';
import {
  INQUIRY_URLS_MAX,
  hasInquiryErrors,
  inquiryAttachmentFileName,
  isInquiryStatus,
  normalizeRelatedUrls,
  validateInquiryInput,
  type UserInquirySummaryJson,
} from '@/lib/inquiry-shared';

// お問い合わせの送信（ページ お問い合わせフォーム仕様書 §7）。ログイン・未ログインどちらも送信できる。
// ログイン済みは返信先を確実にするため、メールアドレス・表示名をクライアントの値ではなくアカウントから取る（§3）。
// 書き込みは Admin SDK のみ（firestore.rules の inquiries はクライアントからの書き込みを許可しない）。
// 管理者へのメール通知・admin_notifications は未実装（管理 お問い合わせ管理仕様書 実装注記）。
// 画像の添付（§9）はログイン済みのみ。multipart/form-data で受け、検証・再エンコード・Storage への保存を済ませてから、
// 1日の上限の加算と同じトランザクションでお問い合わせを書く。途中で失敗したら保存した画像を消す（一部だけ付いた状態を作らない）。
export async function POST(request: NextRequest) {
  const uid = await getOptionalUid(request);

  const parsed = await readInquiryRequest(request);
  if (!parsed) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  if ('errorResponse' in parsed) return parsed.errorResponse;
  const { body, files } = parsed;
  if (files.length > 0 && !uid) return attachmentErrorResponse('attachment_guest');

  const relatedUrlsRaw = Array.isArray(body.relatedUrls) ? body.relatedUrls : [];
  if (relatedUrlsRaw.length > INQUIRY_URLS_MAX || relatedUrlsRaw.some((u) => typeof u !== 'string')) {
    return NextResponse.json({ error: 'invalid_related_urls' }, { status: 400 });
  }
  // アカウントにメールアドレスが無いログイン済みユーザー（メールを返さないソーシャルログイン等）は、
  // 未ログインと同じく入力されたメールアドレスを返信先にする
  let accountEmail: string | null = null;
  let userName: string | null = null;
  if (uid) {
    const [authUser, userSnap] = await Promise.all([adminAuth.getUser(uid), adminDb.collection('users').doc(uid).get()]);
    accountEmail = authUser.email ?? null;
    userName = (userSnap.data()?.displayName as string | undefined) ?? null;
  }

  const input = {
    category: typeof body.category === 'string' ? body.category : '',
    body: typeof body.body === 'string' ? body.body : '',
    relatedUrls: relatedUrlsRaw as string[],
    email: typeof body.email === 'string' ? body.email : '',
    requireEmail: accountEmail === null,
  };
  const errors = validateInquiryInput(input);
  if (hasInquiryErrors(errors)) return NextResponse.json({ error: 'validation_failed', errors }, { status: 400 });
  const email = accountEmail ?? input.email.trim();

  const now = new Date();
  const ref = adminDb.collection('inquiries').doc();
  let attachments: StoredInquiryAttachment[] = [];
  if (uid && files.length > 0) {
    try {
      await assertDailyQuota(uid, files.length, now);
      attachments = await uploadInquiryImages(ref.id, await processInquiryImages(files));
    } catch (e) {
      if (e instanceof InquiryAttachmentError) return attachmentErrorResponse(e.code);
      throw e;
    }
  }

  const data = {
    userId: uid,
    userName,
    email,
    category: input.category,
    body: input.body.trim(),
    relatedUrls: normalizeRelatedUrls(input.relatedUrls),
    status: 'open',
    isGuest: uid === null,
    operatorMemo: null,
    attachments,
    hasAttachments: attachments.length > 0,
    resolvedAt: null,
    submittedAt: now,
    updatedAt: now,
  };
  if (!uid || attachments.length === 0) {
    await ref.set(data);
    return NextResponse.json({ id: ref.id });
  }

  const fileNames = attachments.map(inquiryAttachmentFileName);
  try {
    const saved = await adminDb.runTransaction(async (tx) => {
      if (!(await reserveDailyQuota(tx, uid, attachments.length, now))) return false;
      tx.set(ref, data);
      return true;
    });
    if (!saved) {
      await deleteInquiryImages(ref.id, fileNames);
      return attachmentErrorResponse('attachment_daily_limit');
    }
  } catch (e) {
    await deleteInquiryImages(ref.id, fileNames);
    throw e;
  }
  return NextResponse.json({ id: ref.id });
}

// 自分のお問い合わせ一覧（ページ お問い合わせ履歴 仕様書 §3・§1.1）。対応メモ・メールアドレス等の内部項目を渡さないため
// rules で本人の直接読み取りを閉じ、ここで公開してよい項目だけを返す。userId の等価条件のみのため複合インデックス不要。
// ゲストとして送ったお問い合わせ（userId が null）は含まれない
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const snap = await adminDb.collection('inquiries').where('userId', '==', auth.uid).get();
  const items: UserInquirySummaryJson[] = snap.docs
    .map((d) => {
      const data = d.data();
      const lastAdmin: number = data.lastAdminMessageAt?.toMillis?.() ?? 0;
      const lastRead: number = data.userLastReadAt?.toMillis?.() ?? 0;
      return {
        id: d.id,
        category: (data.category as string) ?? 'other',
        status: isInquiryStatus(data.status) ? data.status : 'open',
        body: (data.body as string) ?? '',
        submittedAt: data.submittedAt?.toMillis?.() ?? 0,
        hasUnread: lastAdmin > lastRead,
      };
    })
    .sort((a, b) => b.submittedAt - a.submittedAt);
  return NextResponse.json({ items });
}
