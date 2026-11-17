import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { NOTICE_IMAGE_REQUEST_BYTES_MAX, NoticeImageError, uploadNoticeImage } from '@/lib/notice-server';

// お知らせの画像（画像付きテキストリンク）を置く（管理 お知らせ管理仕様書 v2.0 §6.3）。オーナー・運営者。
// multipart/form-data の `image` に1枚。ファイル名を返し、お知らせへの紐づけは保存・公開のときに行う。
// 差し替え前の画像は、保存・公開で別の画像に替わったときに消す（lib/notice-server.ts）。
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  if (!(request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const length = Number(request.headers.get('content-length'));
  if (!Number.isFinite(length) || length <= 0) return NextResponse.json({ error: 'length_required' }, { status: 411 });
  if (length > NOTICE_IMAGE_REQUEST_BYTES_MAX) return NextResponse.json({ error: 'image_size' }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  try {
    const fileName = await uploadNoticeImage(file);
    return NextResponse.json({ fileName });
  } catch (e) {
    if (e instanceof NoticeImageError) return NextResponse.json({ error: e.code }, { status: e.code === 'image_size' ? 413 : 400 });
    throw e;
  }
}
