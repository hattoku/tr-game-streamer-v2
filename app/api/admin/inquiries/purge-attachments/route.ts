import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { CRON_SECRET } from '@/lib/constants';
import { purgeExpiredInquiryAttachments } from '@/lib/inquiry-attachments-server';

// 保存期間（対応済みから180日）を過ぎたお問い合わせの添付画像を消す（管理 お問い合わせ管理仕様書 §6）。
// Cloud Scheduler から毎日呼ぶ。認証は新着動画の再取得（app/api/admin/refresh-new-videos）と同じく、
// X-Cron-Secret ヘッダーが CRON_SECRET と一致すれば requireAdmin を省く（管理者が手動で叩くこともできる）
export async function POST(request: NextRequest) {
  const cronHeader = request.headers.get('x-cron-secret');
  const isCronRequest = Boolean(CRON_SECRET) && cronHeader === CRON_SECRET;
  if (!isCronRequest) {
    const auth = await requireAdmin(request);
    if ('errorResponse' in auth) return auth.errorResponse;
  }

  const result = await purgeExpiredInquiryAttachments(new Date());
  return NextResponse.json({ ok: true, ...result });
}
