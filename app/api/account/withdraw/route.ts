import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { readJsonObject } from '@/lib/request-json';
import { deleteAccountAndData } from '@/lib/account-delete-server';
import { WITHDRAW_REASON_MAX } from '@/lib/account-status-shared';

// 本人の退会（ページ 設定 仕様書 §8）。その場で、本人の作成データとアカウントを消去する（2026-11-19 ユーザー決定。
// 旧仕様の「残して締め出す」を置き換え。運営の承認は待たない）。消したものは戻せない。理由は任意。
// 管理者・テスト用会員は退会できない。確認のため、リクエストに confirm: true を必須にする。
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = (await readJsonObject(request)) ?? {};
  if (body.confirm !== true) return NextResponse.json({ error: 'confirm_required' }, { status: 400 });
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length > WITHDRAW_REASON_MAX) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const data = (await adminDb.collection('users').doc(auth.uid).get()).data();
  // users が無いのは、前回の退会が途中で止まったとき（Firebase Auth だけ残っている）。残りを消すためにそのまま進める
  if (data && (data.role !== 'user' || data.isTestUser === true)) {
    return NextResponse.json({ error: 'not_allowed' }, { status: 403 });
  }

  await deleteAccountAndData(auth.uid, reason || null);
  return NextResponse.json({ ok: true });
}
