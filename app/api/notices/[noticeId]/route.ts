import { NextRequest, NextResponse } from 'next/server';
import { getPublishedNotice } from '@/lib/notice-server';

// 公開中のお知らせ1件（管理 お知らせ管理仕様書 v2.0 §7.4・§8）。ログイン不要。非公開・下書き・存在しないものは 404。
export async function GET(_request: NextRequest, { params }: { params: Promise<{ noticeId: string }> }) {
  const { noticeId } = await params;
  const notice = await getPublishedNotice(noticeId);
  if (!notice) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ notice }, { headers: { 'Cache-Control': 'no-store' } });
}
