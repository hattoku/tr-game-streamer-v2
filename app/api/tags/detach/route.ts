import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';

// タグの削除（一般ユーザーによるタグ編集。ページ ゲームタイトル 詳細仕様書 §8.1）。
// 固定タグ（管理者が設定したロックタグ）は削除不可。使用件数が0になったユーザータグは
// 自動削除しない（運営者タグと同じ「マスタは基本永続」方針。フェーズ3計画参照）。

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

  await targetRef.update({ [tagIdsField(targetType)]: FieldValue.arrayRemove(tagId) });

  const tagRef = adminDb.collection('tags').doc(tagId);
  const tagSnap = await tagRef.get();
  if (tagSnap.exists) {
    const currentCount = tagSnap.data()![usageCountField(targetType)] ?? 0;
    await tagRef.update({ [usageCountField(targetType)]: Math.max(0, currentCount - 1) });
  }

  return NextResponse.json({ ok: true });
}
