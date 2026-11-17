import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { readJsonObject } from '@/lib/request-json';
import { ADMIN_USER_RECORDS } from '@/lib/account-status-server';
import { ADMIN_NOTE_MAX } from '@/lib/account-status-shared';

// 運営用の備考（管理 ユーザー管理仕様書 §3.6）。管理者だけが読み書きする（admin_user_records。本人には見えない）
type Params = { params: Promise<{ userId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { userId } = await params;

  const body = await readJsonObject(request);
  if (!body || typeof body.note !== 'string') return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  const note = body.note.trim();
  if (note.length > ADMIN_NOTE_MAX) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const userSnap = await adminDb.collection('users').doc(userId).get();
  if (!userSnap.exists) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const operator = (await adminDb.collection('users').doc(auth.uid).get()).data();
  const now = new Date();
  const noteUpdatedByName = typeof operator?.displayName === 'string' ? operator.displayName : null;
  await adminDb
    .collection(ADMIN_USER_RECORDS)
    .doc(userId)
    .set({ note, noteUpdatedAt: now, noteUpdatedBy: auth.uid, noteUpdatedByName }, { merge: true });
  return NextResponse.json({ note, noteUpdatedAt: now.toISOString(), noteUpdatedByName });
}
