import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { readJsonObject } from '@/lib/request-json';
import { canWithdrawUser } from '@/lib/admin-users-server';
import { withdrawAccount, writeOperationLog } from '@/lib/account-status-server';
import { WITHDRAW_REASON_MAX } from '@/lib/account-status-shared';

// 管理者による退会（管理 ユーザー管理仕様書 §3.4）。アカウントは残し、ログインできなくする。
// 管理者が退会させた場合、本人では再開できない（2026-11-17 ユーザー決定。旧仕様の BAN もこれにまとめた）。
// 管理者・AI運営者・テスト用会員は退会させられない。
type Params = { params: Promise<{ userId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { userId } = await params;

  const body = (await readJsonObject(request)) ?? {};
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length > WITHDRAW_REASON_MAX) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const data = (await adminDb.collection('users').doc(userId).get()).data();
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (data.isAI === true || !canWithdrawUser({ role: data.role === 'user' ? 'user' : 'operator', isTestUser: data.isTestUser === true })) {
    return NextResponse.json({ error: 'not_allowed' }, { status: 403 });
  }

  const changed = await withdrawAccount(userId, { by: 'admin', adminReason: reason || null });
  if (!changed) return NextResponse.json({ error: 'already_withdrawn' }, { status: 409 });
  await writeOperationLog({
    operatorId: auth.uid,
    action: 'user_withdraw',
    targetId: userId,
    targetName: (data.displayName as string | undefined) ?? null,
    detail: { reason: reason || null },
  });
  return NextResponse.json({ ok: true });
}
