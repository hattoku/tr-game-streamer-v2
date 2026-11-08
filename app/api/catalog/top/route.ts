import { catalogResponse, topCatalog } from '../../../../lib/catalog-server';

// TOP の各セクション（注目・新着・タグピックアップ）の再生リスト。ログイン不要。共通 一覧のサーバー側検索 仕様書 §3.4。
// リクエストの値を読まないため、ビルド時に静的に作られないよう毎回実行する指定をする
export const dynamic = 'force-dynamic';

export async function GET() {
  return catalogResponse(topCatalog);
}
