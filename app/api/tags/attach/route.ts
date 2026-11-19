import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { issueTagIds } from '@/scripts/lib/tag-id.mjs';
import { playlistCountDeltas, playlistCountStateOf } from '@/lib/listing-counts';
import { prepareCountWrites, readerOf } from '@/lib/listing-counts-server';

// タグの付与（一般ユーザーによるタグ編集。ページ ゲームタイトル 詳細仕様書 第8章、
// 管理 マスタ管理仕様書 §2）。再生リスト・ゲームタイトル共通で使う。
// `counters/tags`はfirestore.rulesで管理者以外書き込み不可のため、新規タグ作成
// （既存タグと同名一致しない場合）を伴う付与はAdmin SDK経由でのみ行う
// （scripts/lib/tag-id.mjsのissueTagIdsをフェーズ1のマスタ投入スクリプトと共用し、
// 採番の衝突を防ぐ）。
// 再生リストのタグの件数（usagePlaylistCount）は掲載中の再生リストだけを数えるので、共通の処理
// （lib/listing-counts.ts）で付与と一緒にトランザクションで直す。ゲームタイトルのタグの件数（usageGameCount）はここで直す。

type TargetType = 'playlist' | 'game';

function targetCollection(type: TargetType): string {
  return type === 'game' ? 'games' : 'playlists';
}
function tagIdsField(type: TargetType): string {
  return type === 'game' ? 'gameTagIds' : 'playlistTagIds';
}
function usageCountField(type: TargetType): string {
  return type === 'game' ? 'usageGameCount' : 'usagePlaylistCount';
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = (await request.json()) as { targetType?: string; targetId?: string; tagName?: string };
  const targetType = body.targetType === 'game' ? 'game' : body.targetType === 'playlist' ? 'playlist' : null;
  const targetId = typeof body.targetId === 'string' ? body.targetId : null;
  const tagName = typeof body.tagName === 'string' ? body.tagName.trim() : '';

  if (!targetType || !targetId) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  if (!tagName) {
    return NextResponse.json({ error: 'empty_tag_name' }, { status: 400 });
  }

  const targetRef = adminDb.collection(targetCollection(targetType)).doc(targetId);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    return NextResponse.json({ error: 'target_not_found' }, { status: 404 });
  }
  const targetData = targetSnap.data()!;
  const currentTagIds: string[] = targetData[tagIdsField(targetType)] ?? [];

  // 既存タグとの完全一致（重複登録防止。8.3節「重複」）
  const existingSnap = await adminDb.collection('tags').where('name', '==', tagName).limit(1).get();
  let tagId: string;

  if (!existingSnap.empty) {
    tagId = existingSnap.docs[0].id;
    if (currentTagIds.includes(tagId)) {
      return NextResponse.json({ error: 'already_attached' }, { status: 409 });
    }
    if (targetType === 'game') {
      await adminDb
        .collection('tags')
        .doc(tagId)
        .update({ [usageCountField(targetType)]: FieldValue.increment(1) });
    }
  } else {
    const [newTagId] = await issueTagIds(adminDb, 1);
    tagId = newTagId;
    await adminDb
      .collection('tags')
      .doc(tagId)
      .set({
        tagId,
        name: tagName,
        origin: 'user',
        // 再生リストの件数は、このあとの付与（attachToPlaylist）で掲載中なら1になる
        usagePlaylistCount: 0,
        usageGameCount: targetType === 'game' ? 1 : 0,
        createdAt: new Date(),
        createdBy: auth.uid,
      });
  }

  if (targetType === 'playlist') {
    const result = await attachToPlaylist(targetRef, tagId);
    if (result === 'already_attached') return NextResponse.json({ error: 'already_attached' }, { status: 409 });
    if (result === 'target_not_found') return NextResponse.json({ error: 'target_not_found' }, { status: 404 });
  } else {
    await targetRef.update({ [tagIdsField(targetType)]: FieldValue.arrayUnion(tagId) });
  }

  return NextResponse.json({ tagId, tagName });
}

/** 再生リストにタグを付け、件数（掲載中なら usagePlaylistCount +1）を同じトランザクションで直す */
async function attachToPlaylist(targetRef: DocumentReference, tagId: string): Promise<'ok' | 'already_attached' | 'target_not_found'> {
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(targetRef);
    if (!snap.exists) return 'target_not_found';
    const data = snap.data()!;
    const current = (data.playlistTagIds as string[] | undefined) ?? [];
    if (current.includes(tagId)) return 'already_attached';
    const counts = await prepareCountWrites(
      readerOf(tx),
      playlistCountDeltas(playlistCountStateOf(data), playlistCountStateOf({ ...data, playlistTagIds: [...current, tagId] })),
    );
    tx.update(targetRef, { playlistTagIds: FieldValue.arrayUnion(tagId) });
    counts.write(tx);
    return 'ok';
  });
}
