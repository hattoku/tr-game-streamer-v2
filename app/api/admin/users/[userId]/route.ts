import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { readJsonObject } from '@/lib/request-json';
import { getAdminUserDetail } from '@/lib/admin-users-server';
import { writeOperationLog } from '@/lib/account-status-server';
import { syncUserDenormalizedFields } from '@/lib/profile-server';
import { validateProfileInput } from '@/lib/profile-shared';

// ユーザー詳細（§3.2）と登録情報の編集（§3.3）。オーナー・運営者。
// 編集できるのはユーザー名・自己紹介だけ（アイコンは削除のみ、別 API）。メールアドレスは管理者から変えられない
// （2026-11-17 ユーザー決定。公開設定など本人の好みの設定にも触らない）。

type Params = { params: Promise<{ userId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { userId } = await params;
  const user = await getAdminUserDetail(userId);
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ user });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { userId } = await params;

  const body = await readJsonObject(request);
  if (!body || typeof body.displayName !== 'string' || typeof body.bio !== 'string') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (Object.keys(validateProfileInput({ displayName: body.displayName, bio: body.bio })).length > 0) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const displayName = body.displayName.trim();
  const bio = body.bio.trim();

  const userRef = adminDb.collection('users').doc(userId);
  const data = (await userRef.get()).data();
  if (!data || data.isAI === true) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const before = { displayName: data.displayName ?? '', bio: data.bio ?? '' };
  if (before.displayName === displayName && before.bio === bio) return NextResponse.json({ ok: true });

  await userRef.update({ displayName, bio });
  if (before.displayName !== displayName) {
    await syncUserDenormalizedFields(userId, { userDisplayName: displayName }, 'admin user PATCH');
  }
  await writeOperationLog({
    operatorId: auth.uid,
    action: 'user_profile_edit',
    targetId: userId,
    targetName: displayName,
    detail: { before, after: { displayName, bio } },
  });
  return NextResponse.json({ ok: true });
}
