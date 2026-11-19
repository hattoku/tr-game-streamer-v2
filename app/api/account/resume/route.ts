import { NextRequest, NextResponse } from 'next/server';
import { requireSignedInIncludingWithdrawn } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { restoreAccount } from '@/lib/account-status-server';
import { accountStatusOf, withdrawnByOf } from '@/lib/account-status-shared';

// 退会中の本人が、今のメールアドレス・パスワードでログインして「利用を再開する」を選んだとき（ページ ログイン 仕様書 §5.5）。
// 本人が退会した場合だけ再開できる。管理者が退会させた場合は本人では再開できない（2026-11-17 ユーザー決定）。
export async function POST(request: NextRequest) {
  const auth = await requireSignedInIncludingWithdrawn(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const data = (await adminDb.collection('users').doc(auth.uid).get()).data();
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (accountStatusOf(data) !== 'withdrawn') return NextResponse.json({ ok: true });
  if (withdrawnByOf(data) !== 'self') return NextResponse.json({ error: 'withdrawn_by_admin' }, { status: 403 });

  await restoreAccount(auth.uid);
  return NextResponse.json({ ok: true });
}
