import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { playlistCountDeltas, playlistCountStateOf } from '@/lib/listing-counts';
import { prepareCountWrites, readerOf } from '@/lib/listing-counts-server';

// タグの削除（一般ユーザーによるタグ編集。ページ ゲームタイトル 詳細仕様書 §8.1）。
// 固定タグ（管理者が設定したロックタグ）は削除不可。使用件数が0になったユーザータグは
// 自動削除しない（運営者タグと同じ「マスタは基本永続」方針。フェーズ3計画参照）。
// 再生リストのタグの件数（usagePlaylistCount）は掲載中の再生リストだけを数えるので、共通の処理
// （lib/listing-counts.ts）で削除と一緒にトランザクションで直す。ゲームタイトルのタグの件数（usageGameCount）はここで直す。

type TargetType = 'playlist' | 'game';

function targetCollection(type: TargetType): string {
  return type === 'game' ? 'games' : 'playlists';
}
function tagIdsField(type: TargetType): string {
  return type === 'game' ? 'gameTagIds' : 'playlistTagIds';
}
function fixedTagIdsField(type: TargetType): string {
  return type === 'game' ? 'gameTagsFixed' : 'playlistTagsFixed';
}
function usageCountField(type: TargetType): string {
  return type === 'game' ? 'usageGameCount' : 'usagePlaylistCount';
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = (await request.json()) as { targetType?: string; targetId?: string; tagId?: string };
  const targetType = body.targetType === 'game' ? 'game' : body.targetType === 'playlist' ? 'playlist' : null;
  const targetId = typeof body.targetId === 'string' ? body.targetId : null;
  const tagId = typeof body.tagId === 'string' ? body.tagId : null;

  if (!targetType || !targetId || !tagId) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const targetRef = adminDb.collection(targetCollection(targetType)).doc(targetId);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    return NextResponse.json({ error: 'target_not_found' }, { status: 404 });
  }
  const targetData = targetSnap.data()!;
  const currentTagIds: string[] = targetData[tagIdsField(targetType)] ?? [];
  const fixedTagIds: string[] = targetData[fixedTagIdsField(targetType)] ?? [];

  if (!currentTagIds.includes(tagId)) {
    return NextResponse.json({ error: 'not_attached' }, { status: 404 });
  }
  if (fixedTagIds.includes(tagId)) {
    return NextResponse.json({ error: 'fixed_tag' }, { status: 403 });
  }

  if (targetType === 'playlist') {
    await detachFromPlaylist(targetRef, tagId);
    return NextResponse.json({ ok: true });
  }

  await targetRef.update({ [tagIdsField(targetType)]: FieldValue.arrayRemove(tagId) });

  const tagRef = adminDb.collection('tags').doc(tagId);
  const tagSnap = await tagRef.get();
  if (tagSnap.exists) {
    const currentCount = tagSnap.data()![usageCountField(targetType)] ?? 0;
    await tagRef.update({ [usageCountField(targetType)]: Math.max(0, currentCount - 1) });
  }

  return NextResponse.json({ ok: true });
}

/** 再生リストからタグを外し、件数（掲載中なら usagePlaylistCount -1）を同じトランザクションで直す */
async function detachFromPlaylist(targetRef: DocumentReference, tagId: string): Promise<void> {
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(targetRef);
    if (!snap.exists) return;
    const data = snap.data()!;
    const current = (data.playlistTagIds as string[] | undefined) ?? [];
    // 同時に外されていたら何もしない（二重に減らさない）
    if (!current.includes(tagId)) return;
    const counts = await prepareCountWrites(
      readerOf(tx),
      playlistCountDeltas(playlistCountStateOf(data), playlistCountStateOf({ ...data, playlistTagIds: current.filter((id) => id !== tagId) })),
    );
    tx.update(targetRef, { playlistTagIds: FieldValue.arrayRemove(tagId) });
    counts.write(tx);
  });
}
