import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { searchRakutenGames, RakutenApiError } from '@/lib/rakuten';

// 楽天ブックスゲーム検索API（管理者専用。フェーズ4.5ステップ8）。
// GameCreateModalのパッケージ画像検索から呼ばれる。RAKUTEN_APPLICATION_ID/ACCESS_KEYを
// ブラウザに露出させないため、クライアントから直接楽天APIを叩かずこのAPI Routeを経由する。
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const title = request.nextUrl.searchParams.get('title')?.trim() ?? '';
  if (!title) {
    return NextResponse.json({ error: 'title_required' }, { status: 400 });
  }

  try {
    const results = await searchRakutenGames(title);
    return NextResponse.json({ results });
  } catch (e) {
    if (e instanceof RakutenApiError) {
      console.error('楽天ブックスAPI検索失敗', e);
      return NextResponse.json({ error: 'rakuten_api_error', message: e.message }, { status: 502 });
    }
    throw e;
  }
}
