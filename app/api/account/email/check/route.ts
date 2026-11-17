import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { EMAIL_RE, normalizeEmail } from '@/lib/email-change-shared';

// メールアドレス変更前の「すでに使われていないか」の確認（ページ 設定 仕様書 §4.3）。
// stg・本番の Firebase Auth は「メールアドレス列挙保護」が有効で、クライアントの verifyBeforeUpdateEmail は
// 使用中のアドレスでもエラーを返さない（確認メールのリンクを開いた時点で失敗する）。そのため Admin SDK で先に確かめる。
//
// 誰でも登録有無を調べられる窓口にならないよう、次の3つで絞る:
// - ログイン必須（Bearer IDトークン）
// - 直前（10分以内）に本人確認したトークンだけ受け付ける。画面はパスワード再入力（reauthenticateWithCredential）の直後に呼ぶ
// - 1人あたり10分で10回まで（インスタンスのメモリで数える簡易な制限。lib/rate-limit.ts と同じ考え方）

const RECENT_AUTH_SEC = 10 * 60;
const WINDOW_MS = 10 * 60_000;
const PER_USER_LIMIT = 10;

const globalForLimit = globalThis as unknown as { __puremiteEmailCheckLimit?: Map<string, { count: number; resetAt: number }> };

function overLimit(uid: string, now = Date.now()): boolean {
  const map = (globalForLimit.__puremiteEmailCheckLimit ??= new Map());
  if (map.size > 5000) for (const [k, v] of map) if (now >= v.resetAt) map.delete(k);
  const c = map.get(uid) ?? { count: 0, resetAt: 0 };
  if (now >= c.resetAt) {
    c.count = 0;
    c.resetAt = now + WINDOW_MS;
  }
  c.count += 1;
  map.set(uid, c);
  return c.count > PER_USER_LIMIT;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!idToken) return NextResponse.json({ error: 'missing bearer token' }, { status: 401 });

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  }

  if (Date.now() / 1000 - decoded.auth_time > RECENT_AUTH_SEC) {
    return NextResponse.json({ error: 'requires recent login' }, { status: 403 });
  }
  if (overLimit(decoded.uid)) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { newEmail?: unknown } | null;
  const newEmail = typeof body?.newEmail === 'string' ? body.newEmail.trim() : '';
  if (!EMAIL_RE.test(newEmail) || newEmail.length > 254) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 });
  }

  try {
    const existing = await adminAuth.getUserByEmail(normalizeEmail(newEmail));
    // 自分自身（現在のアドレス）は画面側で「現在のメールアドレスと同じです」として先に弾く
    return NextResponse.json({ available: existing.uid === decoded.uid });
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/user-not-found') return NextResponse.json({ available: true });
    console.error('[account/email/check] getUserByEmail failed', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
