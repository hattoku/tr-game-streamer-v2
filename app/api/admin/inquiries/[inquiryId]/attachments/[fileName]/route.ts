import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { isInquiryIdShape, serveInquiryAttachment } from '@/lib/inquiry-attachments-server';

// お問い合わせの添付画像（管理 お問い合わせ管理仕様書 §4.6）。operator/owner 共通。
// Storage はクライアントから読めない（storage.rules）ため、管理画面もこの API から fetch して Blob URL で表示する
export async function GET(request: NextRequest, { params }: { params: Promise<{ inquiryId: string; fileName: string }> }) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { inquiryId, fileName } = await params;
  if (!isInquiryIdShape(inquiryId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const ref = adminDb.collection('inquiries').doc(inquiryId);
  const data = (await ref.get()).data();
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return serveInquiryAttachment(ref, data, fileName);
}
