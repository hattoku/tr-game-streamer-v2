import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { fetchRakutenGameByItemUrl } from '@/lib/rakuten';
import { normalizeRakutenBooksItemUrl } from '@/lib/rakuten-shared';

// ゲームタイトルの新規登録API（管理者専用。フェーズ4.5ステップ2）。
// genre/theme/platforms等は管理者の手入力（管理 マスタ管理仕様書 §7.1 の暫定手入力版）。
// パッケージ画像・楽天URLはGameCreateModal側で楽天ブックス検索/商品ページURLから解決済みの値を
// 受け取るのが基本だが、楽天URLだけ渡されて画像が空の場合はここでも商品ページから補完する
// （モーダルで「取得」を押し忘れても画像が欠けないようにするための安全弁）。
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = await request.json();
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const genreId = typeof body.genreId === 'string' && body.genreId ? body.genreId : null;
  const themeIds = Array.isArray(body.themeIds) ? body.themeIds.filter((id: unknown): id is string => typeof id === 'string') : [];
  const platforms = Array.isArray(body.platforms)
    ? body.platforms.filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 0)
    : [];
  let packageImageUrl = typeof body.packageImageUrl === 'string' && body.packageImageUrl.trim() ? body.packageImageUrl.trim() : null;
  let rakutenUrl = typeof body.rakutenUrl === 'string' && body.rakutenUrl.trim() ? body.rakutenUrl.trim() : null;
  const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;

  if (!title) {
    return NextResponse.json({ error: 'title_required' }, { status: 400 });
  }
  if (title.length > 100) {
    return NextResponse.json({ error: 'title_too_long' }, { status: 400 });
  }

  // 同名重複チェック（ページ 再生リストを追加する 仕様書 §4.2.2の「提案」同様、タイトル完全一致で判定）
  const duplicateSnap = await adminDb.collection('games').where('title', '==', title).limit(1).get();
  if (!duplicateSnap.empty) {
    return NextResponse.json({ error: 'already_exists' }, { status: 409 });
  }

  // 楽天ブックス商品ページURLは計測パラメータを除いた正規形で保存する（アフィリエイトリンク変換の
  // 元URLになるため）。パッケージ画像が未指定なら商品ページから補完する（失敗しても登録自体は続行）
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

  const genreRef = genreId ? adminDb.collection('genres').doc(genreId) : null;
  const genreDoc = genreRef ? await genreRef.get() : null;
  if (genreRef && !genreDoc!.exists) {
    return NextResponse.json({ error: 'genre_not_found' }, { status: 404 });
  }
  const genreName = genreDoc?.data()?.name ?? null;

  // themeIdsはクライアントがthemesコレクションから取得した選択肢のみを送る想定だが、
  // gameTitleCount加算の整合性のため念のため実在確認する
  const themeRefs = themeIds.map((id: string) => adminDb.collection('themes').doc(id));
  const themeDocs = themeRefs.length > 0 ? await adminDb.getAll(...themeRefs) : [];
  const validThemeIds = themeDocs.filter((d) => d.exists).map((d) => d.id);

  const now = new Date();
  const gameRef = adminDb.collection('games').doc();
  const batch = adminDb.batch();

  batch.set(gameRef, {
    rakutenItemCode: null,
    rakutenItemName: null,
    title,
    packageImageUrl,
    rakutenUrl,
    description,
    isAiGeneratedDescription: false,
    platforms,
    genreId,
    genreName,
    themeIds: validThemeIds,
    gameTagIds: [],
    gameTagsFixed: [],
    playlistCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  if (genreRef) {
    batch.update(genreRef, { gameTitleCount: FieldValue.increment(1) });
  }
  for (const id of validThemeIds) {
    batch.update(adminDb.collection('themes').doc(id), { gameTitleCount: FieldValue.increment(1) });
  }

  await batch.commit();

  return NextResponse.json({
    id: gameRef.id,
    title,
    packageImageUrl,
  });
}
