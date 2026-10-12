import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { savedCollectionDocId } from '@/lib/collections-server';

// まとめの保存（ページ 再生リスト まとめ機能仕様書 §8）。
// 保存記録 saved_collections/{uid}_{collectionId} の作成・削除と collections.savedCount の増減を
// トランザクションで行う（savedCount は作成者本人にも書かせないため Admin SDK 経由）。
// - GET: 自分が保存しているか（まとめ詳細の保存ボタンの初期表示）
// - POST: 保存。公開・限定公開の他人のまとめのみ（§2.3・§8.2「自分のまとめには保存ボタンを出さない」）
// - DELETE: 保存の解除。まとめが非公開化・削除されていても解除できる（保存したまとめ一覧の「保存を解除」）

type Params = { params: Promise<{ collectionId: string }> };

class SaveError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { collectionId } = await params;
  const snap = await adminDb.collection('saved_collections').doc(savedCollectionDocId(auth.uid, collectionId)).get();
  return NextResponse.json({ saved: snap.exists });
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { collectionId } = await params;
  const collectionRef = adminDb.collection('collections').doc(collectionId);
  const savedRef = adminDb.collection('saved_collections').doc(savedCollectionDocId(auth.uid, collectionId));

  try {
    const savedCount = await adminDb.runTransaction(async (tx) => {
      const [collectionSnap, savedSnap] = await Promise.all([tx.get(collectionRef), tx.get(savedRef)]);
      const data = collectionSnap.data();
      if (!data || (data.visibility !== 'public' && data.visibility !== 'unlisted')) throw new SaveError('not_found', 404);
      if (data.userId === auth.uid) throw new SaveError('own_collection', 400);
      const current = (data.savedCount as number | undefined) ?? 0;
      if (savedSnap.exists) return current;
      tx.set(savedRef, { userId: auth.uid, collectionId, collectionTitle: data.title ?? '', savedAt: new Date() });
      tx.update(collectionRef, { savedCount: FieldValue.increment(1) });
      return current + 1;
    });
    return NextResponse.json({ saved: true, savedCount });
  } catch (e) {
    if (e instanceof SaveError) return NextResponse.json({ error: e.code }, { status: e.status });
    throw e;
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { collectionId } = await params;
  const collectionRef = adminDb.collection('collections').doc(collectionId);
  const savedRef = adminDb.collection('saved_collections').doc(savedCollectionDocId(auth.uid, collectionId));

  await adminDb.runTransaction(async (tx) => {
    const [collectionSnap, savedSnap] = await Promise.all([tx.get(collectionRef), tx.get(savedRef)]);
    if (!savedSnap.exists) return;
    tx.delete(savedRef);
    // 削除済みのまとめなら減算対象が無い。0未満にはしない
    if (collectionSnap.exists && ((collectionSnap.data()?.savedCount as number | undefined) ?? 0) > 0) {
      tx.update(collectionRef, { savedCount: FieldValue.increment(-1) });
    }
  });
  return NextResponse.json({ saved: false });
}
