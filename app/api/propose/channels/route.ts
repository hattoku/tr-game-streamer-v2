import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { getProposeChannel, searchProposeChannels } from '@/lib/propose-server';

// 提案ページの再生リスト側で、掲載中のチャンネルを探す（ページ 提案する 仕様書 §5.1・§10）。ログイン必須。
// `q` で名前の部分一致（最大10件）、`id` で1件（チャンネル詳細から来たとき）。YouTube の検索は使わない。
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const id = request.nextUrl.searchParams.get('id');
  if (id) {
    const channel = await getProposeChannel(id);
    return NextResponse.json({ channels: channel ? [channel] : [] });
  }
  const q = (request.nextUrl.searchParams.get('q') ?? '').slice(0, 100);
  return NextResponse.json({ channels: await searchProposeChannels(q) });
}
