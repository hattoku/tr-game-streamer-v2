import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { restoreAccount, writeOperationLog } from '@/lib/account-status-server';

// 管理者による退会の解除（管理 ユーザー管理仕様書 §3.5）。本人が退会した場合も、管理者が退会させた場合も解除できる
type Params = { params: Promise<{ userId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { userId } = await params;

  const data = (await adminDb.collection('users').doc(userId).get()).data();
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const changed = await restoreAccount(userId);
  if (!changed) return NextResponse.json({ error: 'not_withdrawn' }, { status: 409 });
  await writeOperationLog({
    operatorId: auth.uid,
    action: 'user_restore',
    targetId: userId,
    targetName: (data.displayName as string | undefined) ?? null,
    detail: { withdrawnBy: data.withdrawnBy ?? null },
  });
  return NextResponse.json({ ok: true });
}
