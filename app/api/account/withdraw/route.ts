import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { readJsonObject } from '@/lib/request-json';
import { withdrawAccount } from '@/lib/account-status-server';
import { WITHDRAW_REASON_MAX } from '@/lib/account-status-shared';

// 本人の退会（ページ 設定 仕様書 §8）。その場で退会にする（2026-11-17 ユーザー決定。運営の承認は待たない）。
// アカウント・データは残し、ログインできなくする。理由は任意。管理者は退会できない（管理画面が使えなくなるため）。
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = (await readJsonObject(request)) ?? {};
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length > WITHDRAW_REASON_MAX) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const data = (await adminDb.collection('users').doc(auth.uid).get()).data();
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (data.role !== 'user' || data.isTestUser === true) {
    return NextResponse.json({ error: 'not_allowed' }, { status: 403 });
  }

  await withdrawAccount(auth.uid, { by: 'self', reason: reason || null });
  return NextResponse.json({ ok: true });
}
