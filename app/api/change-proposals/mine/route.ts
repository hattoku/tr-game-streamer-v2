import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { findMyPendingChange } from '@/lib/change-proposal-server';

// 詳細ページでモーダルを開いたとき、この対象に自分の審査中の提案があるか（仕様書 §3.2「再表示」）
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const targetKey = request.nextUrl.searchParams.get('targetKey') ?? '';
  if (!/^(game|channel|playlist):[\w-]{1,128}$/.test(targetKey)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const pending = await findMyPendingChange(auth.uid, targetKey);
  return NextResponse.json({ pending: !!pending });
}
