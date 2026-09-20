import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { WATCH_STATUS_ORDER, type WatchStatus } from '@/components/ui/Chip';

// マイリストの追加・削除専用API（HANDOFF.md 未解決事項11、フェーズ4.5ステップ3）。
// playlists.mylistCount の増減は、firestore.rules 上 playlists の一般ユーザー更新許可
// フィールドが playlistTagIds のみのためクライアントSDKからは構造的に不可能。
// 追加・削除だけこの Admin SDK API に寄せ、FieldValue.increment で加算・減算する
// （app/api/reviews/upsert のマイリスト自動作成経路も同様に increment する）。
// ステータス変更・逆順トグルはカウントに影響しないため、引き続きクライアントSDK直書き
// （AddToMylistButton.tsx・app/(main)/mylist/page.tsx 参照）。

const WATCH_STATUS_VALUES = new Set<string>(WATCH_STATUS_ORDER);

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const uid = auth.uid;

  const body = await request.json();
  const playlistId = typeof body.playlistId === 'string' ? body.playlistId : '';
  const watchStatus =
    typeof body.watchStatus === 'string' && WATCH_STATUS_VALUES.has(body.watchStatus)
      ? (body.watchStatus as WatchStatus)
      : null;
  if (!playlistId || !watchStatus) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const playlistRef = adminDb.collection('playlists').doc(playlistId);
  const mylistRef = adminDb.collection('mylist').doc(`${uid}_${playlistId}`);
  const [playlistSnap, mylistSnap] = await Promise.all([playlistRef.get(), mylistRef.get()]);
  if (!playlistSnap.exists) {
    return NextResponse.json({ error: 'playlist_not_found' }, { status: 404 });
  }
  if (mylistSnap.exists) {
    return NextResponse.json({ error: 'already_added' }, { status: 409 });
  }

  const now = new Date();
  const batch = adminDb.batch();
  batch.set(mylistRef, {
    userId: uid,
    playlistId,
    watchStatus,
    isReverseOrder: false,
    createdAt: now,
    updatedAt: now,
  });
  batch.update(playlistRef, { mylistCount: FieldValue.increment(1) });
  await batch.commit();

  return NextResponse.json({ mylistId: mylistRef.id });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const uid = auth.uid;

  const body = await request.json();
  const playlistId = typeof body.playlistId === 'string' ? body.playlistId : '';
  if (!playlistId) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const mylistRef = adminDb.collection('mylist').doc(`${uid}_${playlistId}`);
  const mylistSnap = await mylistRef.get();
  if (!mylistSnap.exists) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const batch = adminDb.batch();
  batch.delete(mylistRef);
  batch.update(adminDb.collection('playlists').doc(playlistId), { mylistCount: FieldValue.increment(-1) });
  await batch.commit();

  return NextResponse.json({ ok: true });
}
