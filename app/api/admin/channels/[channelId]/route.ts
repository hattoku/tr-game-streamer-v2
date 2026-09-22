import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';

// チャンネル説明文の編集API（管理者専用。ページ チャンネル 詳細 仕様書 §3.3「説明文の編集」）。
// 更新対象は description と isAiGeneratedDescription のみ（name/iconUrl は YouTube 由来のため触らない）。
// firestore.rules 上は管理者がクライアントSDKで直接書けるが、ゲームタイトル編集（app/api/admin/games/[gameId]）と
// 同じく管理者の書き込みは Admin SDK の API Route に寄せる。
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { channelId } = await params;
  const channelRef = adminDb.collection('channels').doc(channelId);
  const channelSnap = await channelRef.get();
  if (!channelSnap.exists) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const body = await request.json();
  if (typeof body.description !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const description = body.description.trim() || null;
  // 説明文が空ならバッジも意味を失うので false（ゲームタイトル編集APIと同じ扱い）
  const isAiGeneratedDescription = description ? body.isAiGeneratedDescription === true : false;

  await channelRef.update({ description, isAiGeneratedDescription });

  return NextResponse.json({ id: channelId, description, isAiGeneratedDescription });
}
