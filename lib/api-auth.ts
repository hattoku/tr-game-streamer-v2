import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from './firebase-admin';

const ADMIN_ROLES = new Set(['owner', 'operator']);

async function verifyBearerToken(
  request: NextRequest,
): Promise<{ uid: string; role: string | undefined } | { errorResponse: NextResponse }> {
  const authHeader = request.headers.get('authorization');
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!idToken) {
    return { errorResponse: NextResponse.json({ error: 'missing bearer token' }, { status: 401 }) };
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return { uid: decoded.uid, role: decoded.role };
  } catch {
    return { errorResponse: NextResponse.json({ error: 'invalid token' }, { status: 401 }) };
  }
}

/**
 * Authorizationヘッダー（Bearer IDトークン）を検証し、管理者ロール（owner/operator）
 * であることを確認する。API Routeから共通で使う想定。
 */
export async function requireAdmin(
  request: NextRequest,
): Promise<{ uid: string } | { errorResponse: NextResponse }> {
  const verified = await verifyBearerToken(request);
  if ('errorResponse' in verified) return verified;

  if (typeof verified.role !== 'string' || !ADMIN_ROLES.has(verified.role)) {
    return { errorResponse: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }

  return { uid: verified.uid };
}

/**
 * Authorizationヘッダー（Bearer IDトークン）の検証のみ行う（ロール不問）。
 * レビュー投稿・タグ付与など、一般ユーザーが行うがサーバー側計算が必要な操作向け
 * （フェーズ3計画 wiki/sources 参照）。
 */
export async function requireUser(
  request: NextRequest,
): Promise<{ uid: string } | { errorResponse: NextResponse }> {
  const verified = await verifyBearerToken(request);
  if ('errorResponse' in verified) return verified;
  return { uid: verified.uid };
}
