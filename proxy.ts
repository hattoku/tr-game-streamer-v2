import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { STG_GATE_COOKIE_NAME, computeStgGateToken } from './lib/stg-gate';
import { COLLECTIONS_ENABLED } from './lib/feature-flags';

// まとめ機能の取り下げ（2026-11-01、ページ一覧仕様書 v2.0）で閉じたページ（/collections 配下）は、存在しないパスへ
// 書き換えて HTTP ステータス 404 の 404 ページを返す。ページ側（app/(main)/collections/layout.tsx）の notFound() だけでは、
// (main) の loading.tsx のストリーミングが先に始まるため本文は 404 ページでもステータスが 200 になる
const CLOSED_PATH = '/__closed';

function isClosedPath(pathname: string): boolean {
  return !COLLECTIONS_ENABLED && (pathname === '/collections' || pathname.startsWith('/collections/'));
}

function pass(request: NextRequest): NextResponse {
  if (isClosedPath(request.nextUrl.pathname)) return NextResponse.rewrite(new URL(CLOSED_PATH, request.url));
  return NextResponse.next();
}

// 検証段階のため環境を問わずCookieゲートを適用する（変数名の"STAGING_"はBasic認証導入時の名残）。
// gatePasswordがCloud Run側に設定されている場合のみ動作する
export async function proxy(request: NextRequest) {
  const gatePassword = process.env.STAGING_GATE_PASSWORD;
  if (!gatePassword) return pass(request);

  const cookieToken = request.cookies.get(STG_GATE_COOKIE_NAME)?.value;
  const expectedToken = await computeStgGateToken(gatePassword);

  if (cookieToken === expectedToken) return pass(request);

  const loginUrl = new URL('/stg-login', request.url);
  loginUrl.searchParams.set('redirect', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

// staticファイルや画像、APIルート、ゲート自体のログインページを除外
// APIルートはFirebase IDトークン（Authorization: Bearer）で別途保護されているため対象外とする。
// /api/stg-gate（ログインフォームの送信先）もapi配下のため自動的に対象外。
// PWAのmanifest・アイコン（manifest.webmanifest / icons/ / apple-icon）も除外する。ゲート未通過の
// ブラウザ・iOSがこれらを取得するとログイン画面へのリダイレクトが返り、インストールやアイコン表示が失敗するため。
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|apple-icon|api|stg-login).*)'],
};
