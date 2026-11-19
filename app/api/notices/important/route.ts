import { NextResponse } from 'next/server';
import { listImportantNotices } from '@/lib/notice-server';

// TOP の重要なお知らせエリアに今出すもの（管理 お知らせ管理仕様書 v2.0 §7.1・§8）。ログイン不要。
export async function GET() {
  const notices = await listImportantNotices();
  return NextResponse.json({ notices }, { headers: { 'Cache-Control': 'no-store' } });
}
