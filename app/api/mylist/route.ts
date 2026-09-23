import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';

// マイリストの削除専用API（HANDOFF.md 未解決事項11、フェーズ4.5ステップ3）。
// playlists.mylistCount の増減は、firestore.rules 上 playlists の一般ユーザー更新許可
// フィールドが playlistTagIds のみのためクライアントSDKからは構造的に不可能。
// 削除だけこの Admin SDK API に寄せ、FieldValue.increment で減算する
// （app/(main)/mylist/page.tsx の「マイリストから削除」ボタンで使用）。
// マイリストへの追加・視聴ステータス変更（増加側の increment を含む）は再生リスト詳細
// ページの視聴ステータス記録UIから app/api/reviews/upsert 経由で行う（フェーズ○ 視聴ステータス
// 記録・レビュー投稿UI統合。旧 AddToMylistButton.tsx の POST 経路はこの統合で廃止した）。
// 逆順トグルはカウントに影響しないため、引き続きクライアントSDK直書き
// （components/mylist/MylistCard.tsx・app/(main)/mylist/page.tsx 参照）。

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
