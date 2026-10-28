import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { isInquiryIdShape, serveInquiryAttachment } from '@/lib/inquiry-attachments-server';

// 自分のお問い合わせの添付画像（ページ お問い合わせフォーム仕様書 §9.6、お問い合わせ履歴 仕様書 §4）。
// 本人以外・存在しない・ゲストのお問い合わせ・削除済みの画像は区別せず 404（GET /api/inquiries/[inquiryId] と同じ）。
// <img src> では Authorization ヘッダーを送れないため、画面は fetch で取得して Blob URL で表示する
export async function GET(request: NextRequest, { params }: { params: Promise<{ inquiryId: string; fileName: string }> }) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { inquiryId, fileName } = await params;
  if (!isInquiryIdShape(inquiryId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const ref = adminDb.collection('inquiries').doc(inquiryId);
  const data = (await ref.get()).data();
  if (!data || data.userId !== auth.uid || data.isGuest === true) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return serveInquiryAttachment(ref, data, fileName);
}
