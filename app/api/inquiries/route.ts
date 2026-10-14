import { NextRequest, NextResponse } from 'next/server';
import { getOptionalUid } from '@/lib/api-auth';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { readJsonObject } from '@/lib/collections-server';
import { INQUIRY_URLS_MAX, hasInquiryErrors, normalizeRelatedUrls, validateInquiryInput } from '@/lib/inquiry-shared';

// お問い合わせの送信（ページ お問い合わせフォーム仕様書 §7）。ログイン・未ログインどちらも送信できる。
// ログイン済みは返信先を確実にするため、メールアドレス・表示名をクライアントの値ではなくアカウントから取る（§3）。
// 書き込みは Admin SDK のみ（firestore.rules の inquiries はクライアントからの書き込みを許可しない）。
// 管理者へのメール通知・admin_notifications は未実装（管理 お問い合わせ管理仕様書 実装注記）。
export async function POST(request: NextRequest) {
  const uid = await getOptionalUid(request);

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

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
  const ref = await adminDb.collection('inquiries').add({
    userId: uid,
    userName,
    email,
    category: input.category,
    body: input.body.trim(),
    relatedUrls: normalizeRelatedUrls(input.relatedUrls),
    status: 'open',
    isGuest: uid === null,
    operatorMemo: null,
    submittedAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ id: ref.id });
}
