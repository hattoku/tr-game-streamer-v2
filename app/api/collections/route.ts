import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS_PER_USER_MAX } from '@/lib/collections-shared';
import { fetchCreatorSnapshot, parseCollectionFields, readJsonObject } from '@/lib/collections-server';

// まとめの作成（ページ 再生リスト まとめ機能仕様書 §4）。
// 1ユーザー10件の上限（§3.3）と作成者名・アイコンの非正規化コピー（reviews と同じ方式）をサーバー側で
// 保証するため、まとめの書き込みはすべて app/api/collections 配下の Admin SDK 経由とする
// （firestore.rules の collections はクライアントからの書き込みを許可しない）。
// 件数確認と作成はトランザクションで行い、別タブ・連打による上限超過を防ぐ。
// 新規作成分は自分のまとめ一覧の先頭に来るよう、既存の最小 sortOrder より 1 小さい値にする（§4.5 既定は新しい順）。
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const uid = auth.uid;

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  const fields = await parseCollectionFields(body);
  if ('error' in fields) return NextResponse.json({ error: fields.error }, { status: 400 });
  const creator = await fetchCreatorSnapshot(uid);

  const ref = adminDb.collection('collections').doc();
  const created = await adminDb.runTransaction(async (tx) => {
    const ownSnap = await tx.get(adminDb.collection('collections').where('userId', '==', uid));
    if (ownSnap.size >= COLLECTIONS_PER_USER_MAX) return false;
    const minSortOrder = Math.min(0, ...ownSnap.docs.map((d) => (d.data().sortOrder as number | undefined) ?? 0));
    const now = new Date();
    tx.set(ref, {
      userId: uid,
      ...creator,
      ...fields,
      savedCount: 0,
      sortOrder: ownSnap.empty ? 0 : minSortOrder - 1,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  });
  if (!created) return NextResponse.json({ error: 'collection_limit' }, { status: 409 });

  return NextResponse.json({ id: ref.id });
}
