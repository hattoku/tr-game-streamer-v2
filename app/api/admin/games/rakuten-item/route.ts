import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { fetchRakutenGameByItemUrl, RakutenApiError } from '@/lib/rakuten';
import { normalizeRakutenBooksItemUrl } from '@/lib/rakuten-shared';

// 楽天ブックス商品ページURLからの商品情報取得API（管理者専用。フェーズ5、2026-09-21）。
// GameCreateModal先頭の商品ページURL欄から呼ばれる。商品ページURLを貼るだけでパッケージ画像URL・
// 商品名を自動セットできるようにする（rakuten-searchと同様、楽天APIキーはサーバー側に閉じる）。
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const url = request.nextUrl.searchParams.get('url')?.trim() ?? '';
  if (!url || !normalizeRakutenBooksItemUrl(url)) {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
  }

  try {
    const result = await fetchRakutenGameByItemUrl(url);
    if (!result) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ result });
  } catch (e) {
    if (e instanceof RakutenApiError) {
      console.error('楽天ブックス商品情報取得失敗', e);
      return NextResponse.json({ error: 'rakuten_api_error', message: e.message }, { status: 502 });
    }
    throw e;
  }
}
