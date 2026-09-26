import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { STG_GATE_COOKIE_NAME, computeStgGateToken } from './lib/stg-gate';

// 検証段階のため環境を問わずCookieゲートを適用する（変数名の"STAGING_"はBasic認証導入時の名残）。
// gatePasswordがCloud Run側に設定されている場合のみ動作する
export async function proxy(request: NextRequest) {
  const gatePassword = process.env.STAGING_GATE_PASSWORD;
  if (!gatePassword) return NextResponse.next();

  const cookieToken = request.cookies.get(STG_GATE_COOKIE_NAME)?.value;
  const expectedToken = await computeStgGateToken(gatePassword);

  if (cookieToken === expectedToken) return NextResponse.next();

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
