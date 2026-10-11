import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { readJsonObject } from '@/lib/collections-server';

// まとめ自体の並び替え（ページ 再生リスト まとめ機能仕様書 §4.5）。
// 自分のまとめ全件のIDを表示順で受け取り、sortOrder を 0,1,2… で振り直す。
// 渡されたIDの集合が自分のまとめ全件と一致しない場合（別タブでの作成・削除直後など）は 409 で拒否する。
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((id): id is string => typeof id === 'string') : [];

  const ownSnap = await adminDb.collection('collections').where('userId', '==', auth.uid).get();
  const ownIds = new Set(ownSnap.docs.map((d) => d.id));
  if (ids.length !== ownIds.size || new Set(ids).size !== ids.length || ids.some((id) => !ownIds.has(id))) {
    return NextResponse.json({ error: 'stale_order' }, { status: 409 });
  }

  const batch = adminDb.batch();
  ids.forEach((id, i) => batch.update(adminDb.collection('collections').doc(id), { sortOrder: i }));
  await batch.commit();
  return NextResponse.json({ ok: true });
}
