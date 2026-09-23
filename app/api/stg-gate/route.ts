import { NextRequest, NextResponse } from 'next/server';
import { STG_GATE_COOKIE_NAME, STG_GATE_MAX_AGE_SECONDS, computeStgGateToken } from '../../../lib/stg-gate';

// app/stg-login/page.tsx のフォームから呼ばれる、Cookieゲートのログイン処理。
// proxy.ts と同じ導出ロジックでトークンを計算しCookieに設定する。
export async function POST(request: NextRequest) {
  const gatePassword = process.env.STAGING_GATE_PASSWORD;
  if (!gatePassword) {
    return NextResponse.json({ error: 'gate not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : null;
  if (!password || password !== gatePassword) {
    return NextResponse.json({ error: 'invalid password' }, { status: 401 });
  }

  const token = await computeStgGateToken(gatePassword);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(STG_GATE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STG_GATE_MAX_AGE_SECONDS,
  });
  return response;
}
