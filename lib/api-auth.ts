import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from './firebase-admin';

const ADMIN_ROLES = new Set(['owner', 'operator']);

/**
 * Authorizationヘッダー（Bearer IDトークン）を検証し、管理者ロール（owner/operator）
 * であることを確認する。API Routeから共通で使う想定。
 */
export async function requireAdmin(
  request: NextRequest,
): Promise<{ uid: string } | { errorResponse: NextResponse }> {
  const authHeader = request.headers.get('authorization');
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!idToken) {
    return { errorResponse: NextResponse.json({ error: 'missing bearer token' }, { status: 401 }) };
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return { errorResponse: NextResponse.json({ error: 'invalid token' }, { status: 401 }) };
  }

  const role = decoded.role;
  if (typeof role !== 'string' || !ADMIN_ROLES.has(role)) {
    return { errorResponse: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }

  return { uid: decoded.uid };
}
