import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { parseGameInput, resolveGameInput, validateGameTitle } from '@/lib/admin-game-input';

// Firestoreのbatchは1回500件まで。playlistsの同期件数が多い場合に備えて余裕を持って分割する
const BATCH_CHUNK = 400;

// ゲームタイトルの編集API（管理者専用。ページ ゲームタイトル 詳細 仕様書 §3.3「情報を編集ボタン」・
// 第7章の暫定版）。GameCreateModalの編集モードから、新規登録と同じ形のボディを受け取る。
// 保存時は games ドキュメントの更新に加えて、
// - genres/themes.gameTitleCount の増減（付け替え分だけ）
// - playlists.gameName / gameGenreIds（denormalized。再生リスト登録API register/route.ts が書く値と同形）
// を同期する。gameGenreIds はレビュー投稿APIのジャンル別集計が参照するため、ジャンル変更時の同期は必須。
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { gameId } = await params;
  const gameRef = adminDb.collection('games').doc(gameId);
  const gameSnap = await gameRef.get();
  if (!gameSnap.exists) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const current = gameSnap.data()!;

  const body = await request.json();
  const input = parseGameInput(body);
  const titleError = validateGameTitle(input.title);
  if (titleError) {
    return NextResponse.json({ error: titleError }, { status: 400 });
  }

  // 同名重複チェック（自分自身は除外）
  const duplicateSnap = await adminDb.collection('games').where('title', '==', input.title).get();
  if (duplicateSnap.docs.some((d) => d.id !== gameId)) {
    return NextResponse.json({ error: 'already_exists' }, { status: 409 });
  }

  const resolved = await resolveGameInput(input);
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 404 });
  }

  // AI生成バッジ表示フラグ: ボディで明示されればそれを、無ければ既存値を維持。説明文が空ならバッジも意味を失うのでfalse
  const isAiGeneratedDescription = resolved.description
    ? typeof body.isAiGeneratedDescription === 'boolean'
      ? body.isAiGeneratedDescription
      : (current.isAiGeneratedDescription ?? false)
    : false;

  const prevGenreId: string | null = current.genreId ?? null;
  const prevThemeIds: string[] = current.themeIds ?? [];
  const titleChanged = current.title !== resolved.title;
  const genreChanged = prevGenreId !== resolved.genreId;

  const batch = adminDb.batch();
  batch.update(gameRef, {
    title: resolved.title,
    packageImageUrl: resolved.packageImageUrl,
    rakutenUrl: resolved.rakutenUrl,
    description: resolved.description,
    isAiGeneratedDescription,
    platforms: resolved.platforms,
    genreId: resolved.genreId,
    genreName: resolved.genreName,
    themeIds: resolved.themeIds,
    updatedAt: new Date(),
  });

  if (genreChanged) {
    if (prevGenreId) batch.update(adminDb.collection('genres').doc(prevGenreId), { gameTitleCount: FieldValue.increment(-1) });
    if (resolved.genreId) batch.update(adminDb.collection('genres').doc(resolved.genreId), { gameTitleCount: FieldValue.increment(1) });
  }
  const nextThemeSet = new Set(resolved.themeIds);
  const prevThemeSet = new Set(prevThemeIds);
  for (const id of prevThemeIds) {
    if (!nextThemeSet.has(id)) batch.update(adminDb.collection('themes').doc(id), { gameTitleCount: FieldValue.increment(-1) });
  }
  for (const id of resolved.themeIds) {
    if (!prevThemeSet.has(id)) batch.update(adminDb.collection('themes').doc(id), { gameTitleCount: FieldValue.increment(1) });
  }
  await batch.commit();

  // denormalized フィールドの同期（変更があった項目だけ）
  if (titleChanged || genreChanged) {
    const playlistUpdate: Record<string, unknown> = {};
    if (titleChanged) playlistUpdate.gameName = resolved.title;
    if (genreChanged) playlistUpdate.gameGenreIds = resolved.genreId ? [resolved.genreId] : [];

    const playlistsSnap = await adminDb.collection('playlists').where('gameId', '==', gameId).get();
    for (let i = 0; i < playlistsSnap.docs.length; i += BATCH_CHUNK) {
      const chunk = adminDb.batch();
      for (const d of playlistsSnap.docs.slice(i, i + BATCH_CHUNK)) {
        chunk.update(d.ref, playlistUpdate);
      }
      await chunk.commit();
    }
  }

  return NextResponse.json({
    id: gameId,
    title: resolved.title,
    packageImageUrl: resolved.packageImageUrl,
  });
}
