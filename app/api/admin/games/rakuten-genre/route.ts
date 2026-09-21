import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { resolveRakutenGenre } from '@/lib/rakuten';

// 楽天ブックスのジャンルIDからジャンル名/テーマ名を解決するAPI（管理者専用。フェーズ5、2026-09-21）。
// GameCreateModalの検索モードで候補を選択したときに呼ばれ、ジャンル・テーマの自動セットに使う
// （検索結果10件分をまとめて解決するとレートリミット1req/秒に引っかかるため、選択時に1件だけ解決する）。
// 解決できない場合もエラーにせず`genre: null`を返す（自動セットを諦めるだけで登録は続けられる）。
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const booksGenreId = request.nextUrl.searchParams.get('booksGenreId')?.trim() ?? '';
  if (!booksGenreId) {
    return NextResponse.json({ error: 'books_genre_id_required' }, { status: 400 });
  }

  const genre = await resolveRakutenGenre(booksGenreId);
  return NextResponse.json({ genre });
}
