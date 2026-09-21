import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { parseGameInput, resolveGameInput, validateGameTitle } from '@/lib/admin-game-input';

// ゲームタイトルの新規登録API（管理者専用。フェーズ4.5ステップ2）。
// genre/theme/platforms等は管理者の手入力（管理 マスタ管理仕様書 §7.1 の暫定手入力版）。
// ボディの正規化・楽天URL正規化/画像補完・マスタ実在確認は編集API（[gameId]/route.ts）と
// 共用の lib/admin-game-input.ts に置いている。
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const input = parseGameInput(await request.json());
  const titleError = validateGameTitle(input.title);
  if (titleError) {
    return NextResponse.json({ error: titleError }, { status: 400 });
  }

  // 同名重複チェック（ページ 再生リストを追加する 仕様書 §4.2.2の「提案」同様、タイトル完全一致で判定）
  const duplicateSnap = await adminDb.collection('games').where('title', '==', input.title).limit(1).get();
  if (!duplicateSnap.empty) {
    return NextResponse.json({ error: 'already_exists' }, { status: 409 });
  }

  const resolved = await resolveGameInput(input);
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 404 });
  }

  const now = new Date();
  const gameRef = adminDb.collection('games').doc();
  const batch = adminDb.batch();

  batch.set(gameRef, {
    rakutenItemCode: null,
    rakutenItemName: null,
    title: resolved.title,
    packageImageUrl: resolved.packageImageUrl,
    rakutenUrl: resolved.rakutenUrl,
    description: resolved.description,
    isAiGeneratedDescription: false,
    platforms: resolved.platforms,
    genreId: resolved.genreId,
    genreName: resolved.genreName,
    themeIds: resolved.themeIds,
    gameTagIds: [],
    gameTagsFixed: [],
    playlistCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  if (resolved.genreId) {
    batch.update(adminDb.collection('genres').doc(resolved.genreId), { gameTitleCount: FieldValue.increment(1) });
  }
  for (const id of resolved.themeIds) {
    batch.update(adminDb.collection('themes').doc(id), { gameTitleCount: FieldValue.increment(1) });
  }

  await batch.commit();

  return NextResponse.json({
    id: gameRef.id,
    title: resolved.title,
    packageImageUrl: resolved.packageImageUrl,
  });
}
