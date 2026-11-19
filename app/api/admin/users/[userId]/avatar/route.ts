import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { writeOperationLog } from '@/lib/account-status-server';
import { syncUserDenormalizedFields } from '@/lib/profile-server';
import { profileImageFileNameFromUrl } from '@/lib/profile-image-shared';
import { deleteProfileImage } from '@/lib/profile-image-server';

// 管理者によるアイコンの削除（管理 ユーザー管理仕様書 §3.3）。不適切な画像を外すため。差し替えはできない（本人だけ）
type Params = { params: Promise<{ userId: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { userId } = await params;

  const userRef = adminDb.collection('users').doc(userId);
  const result = await adminDb.runTransaction(async (tx) => {
    const data = (await tx.get(userRef)).data();
    if (!data || data.isAI === true) return null;
    tx.update(userRef, { profileImageUrl: null });
    return { previous: data.profileImageUrl ?? null, displayName: (data.displayName as string | undefined) ?? null };
  });
  if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (result.previous) {
    await deleteProfileImage(userId, profileImageFileNameFromUrl(userId, result.previous));
    await syncUserDenormalizedFields(userId, { userProfileImageUrl: null }, 'admin avatar DELETE');
    await writeOperationLog({ operatorId: auth.uid, action: 'user_avatar_delete', targetId: userId, targetName: result.displayName });
  }
  return NextResponse.json({ ok: true });
}
