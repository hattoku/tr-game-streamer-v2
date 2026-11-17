import { NextRequest, NextResponse } from 'next/server';
import { listPublishedNotices } from '@/lib/notice-server';
import { NOTICE_PAGE_SIZE } from '@/lib/notice-shared';

// 公開中のお知らせの一覧（管理 お知らせ管理仕様書 v2.0 §7.2・§7.3・§8）。ログイン不要。
// ?limit=3 で TOP の「運営からのお知らせ」欄、?before={公開日のミリ秒} で次のページ。
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = Number(params.get('limit') ?? NOTICE_PAGE_SIZE);
  const beforeRaw = params.get('before');
  const before = beforeRaw === null ? null : Number(beforeRaw);
  if (!Number.isFinite(limit) || limit < 1 || (before !== null && !Number.isFinite(before))) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const result = await listPublishedNotices(limit, before);
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
