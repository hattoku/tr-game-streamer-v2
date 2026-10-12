import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { toCollectionJson } from '@/lib/collections-server';
import type { SavedCollectionJson } from '@/lib/collections-shared';

// 保存したまとめ一覧（ページ 再生リスト まとめ機能仕様書 §8.4）。保存日時の降順。
// 作成者が非公開にしたまとめは本人でもクライアントから読めないため、Admin SDK で読んで
// 「閲覧できなくなったまとめ」（collection: null）として返す（2026-10-12 ユーザー決定）。
// 公開・限定公開に戻れば再び通常どおり返る。削除されたまとめの保存記録はまとめ削除APIで一緒に消している。
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const savedSnap = await adminDb.collection('saved_collections').where('userId', '==', auth.uid).get();
  if (savedSnap.empty) return NextResponse.json({ items: [] });

  const collectionSnaps = await adminDb.getAll(
    ...savedSnap.docs.map((d) => adminDb.collection('collections').doc(d.data().collectionId as string)),
  );
  const byId = new Map(collectionSnaps.map((s) => [s.id, s]));

  const items: SavedCollectionJson[] = savedSnap.docs.map((d) => {
    const data = d.data();
    const snap = byId.get(data.collectionId as string);
    const c = snap?.data();
    const viewable = !!c && (c.visibility === 'public' || c.visibility === 'unlisted');
    return {
      collectionId: data.collectionId as string,
      collectionTitle: (data.collectionTitle as string) ?? '',
      savedAt: (data.savedAt as { toMillis(): number } | undefined)?.toMillis() ?? 0,
      collection: viewable && snap ? toCollectionJson(snap.id, c) : null,
    };
  });
  items.sort((a, b) => b.savedAt - a.savedAt);
  return NextResponse.json({ items });
}
