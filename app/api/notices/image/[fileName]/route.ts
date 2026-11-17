import { NextRequest } from 'next/server';
import { serveNoticeImage } from '@/lib/notice-server';

// お知らせの画像の配信（管理 お知らせ管理仕様書 v2.0 §4.2）。ログイン不要（メールソフトからも読めるように）。
// Storage はクライアントから読めないため、ここで Admin SDK から読んで返す。
export async function GET(_request: NextRequest, { params }: { params: Promise<{ fileName: string }> }) {
  const { fileName } = await params;
  return serveNoticeImage(fileName);
}
