import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { readJsonObject } from '@/lib/request-json';
import { createNoticeDraft, noticeErrorResponse, parseNoticeInput } from '@/lib/notice-server';

// お知らせを下書きで作る（管理 お知らせ管理仕様書 v2.0 §5・§8）。オーナー・運営者。
// 一覧・1件の読み込みは管理画面がクライアント SDK で行う（lib/notice-admin.ts）。
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const body = await readJsonObject(request);
  const input = parseNoticeInput(body?.notice);
  if (!input) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  try {
    const id = await createNoticeDraft(auth.uid, input);
    return NextResponse.json({ id });
  } catch (e) {
    return noticeErrorResponse(e);
  }
}
