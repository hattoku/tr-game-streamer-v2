import { adminDb } from '@/lib/firebase-admin';
import { fetchRakutenGameByItemUrl } from '@/lib/rakuten';
import { normalizeRakutenBooksItemUrl } from '@/lib/rakuten-shared';

// 管理者向けゲームタイトル登録/編集API（app/api/admin/games、app/api/admin/games/[gameId]）で共用する
// リクエストボディの正規化・検証・マスタ解決。新規登録（POST）と編集（PATCH）で同じフォーム
// （GameCreateModal）から同じ形のボディが届くため、ここで一元化している。
// 項目の範囲はページ ゲームタイトル 詳細 仕様書 §7.2（編集可能な項目）の暫定実装版、タイトル必須・100文字上限は
// ページ 再生リストを追加する 仕様書 §4.2.1、ジャンル/テーマは管理 マスタ管理仕様書 §7.1 に準ずる。

export interface GameInput {
  title: string;
  genreId: string | null;
  themeIds: string[];
  platforms: string[];
  packageImageUrl: string | null;
  rakutenUrl: string | null;
  description: string | null;
}

export type GameInputError = 'title_required' | 'title_too_long' | 'genre_not_found';

// マスタ解決まで済んだ保存用の値。genreName/themeIds は実在確認済み
export interface ResolvedGameInput extends GameInput {
  genreName: string | null;
}

// 任意のJSONボディから GameInput を組み立てる（型が合わない値は空扱い）
export function parseGameInput(body: Record<string, unknown>): GameInput {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    title: typeof body.title === 'string' ? body.title.trim() : '',
    genreId: typeof body.genreId === 'string' && body.genreId ? body.genreId : null,
    themeIds: Array.isArray(body.themeIds) ? body.themeIds.filter((id: unknown): id is string => typeof id === 'string') : [],
    platforms: Array.isArray(body.platforms)
      ? body.platforms.filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 0)
      : [],
    packageImageUrl: str(body.packageImageUrl),
    rakutenUrl: str(body.rakutenUrl),
    description: str(body.description),
  };
}

export function validateGameTitle(title: string): GameInputError | null {
  if (!title) return 'title_required';
  if (title.length > 100) return 'title_too_long';
  return null;
}

// 楽天ブックス商品ページURLの正規化とパッケージ画像の補完、ジャンル/テーマの実在確認を行う。
// - 楽天URLは計測パラメータを除いた正規形で保存する（アフィリエイトリンク変換の元URLになるため）。
//   パッケージ画像が未指定なら商品ページから補完する（失敗しても保存自体は続行）。
//   これはモーダルで「取得」を押し忘れても画像が欠けないようにするための安全弁
// - themeIdsはクライアントがthemesコレクションから取得した選択肢のみを送る想定だが、
//   gameTitleCount加減算の整合性のため念のため実在確認する
export async function resolveGameInput(input: GameInput): Promise<ResolvedGameInput | { error: GameInputError }> {
  let { packageImageUrl, rakutenUrl } = input;

  const normalizedRakutenUrl = rakutenUrl ? normalizeRakutenBooksItemUrl(rakutenUrl) : null;
  if (normalizedRakutenUrl) {
    rakutenUrl = normalizedRakutenUrl;
    if (!packageImageUrl) {
      try {
        const item = await fetchRakutenGameByItemUrl(normalizedRakutenUrl);
        if (item?.imageUrl) packageImageUrl = item.imageUrl;
      } catch (e) {
        console.error('楽天ブックス商品ページからのパッケージ画像補完に失敗', e);
      }
    }
  }

  const genreDoc = input.genreId ? await adminDb.collection('genres').doc(input.genreId).get() : null;
  if (genreDoc && !genreDoc.exists) {
    return { error: 'genre_not_found' };
  }
  const genreName = (genreDoc?.data()?.name as string | undefined) ?? null;

  const themeRefs = input.themeIds.map((id) => adminDb.collection('themes').doc(id));
  const themeDocs = themeRefs.length > 0 ? await adminDb.getAll(...themeRefs) : [];
  const validThemeIds = themeDocs.filter((d) => d.exists).map((d) => d.id);

  return {
    ...input,
    packageImageUrl,
    rakutenUrl,
    genreName,
    themeIds: validThemeIds,
  };
}
