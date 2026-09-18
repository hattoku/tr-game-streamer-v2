import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const authUser = process.env.STAGING_BASIC_AUTH_USER;
  const authPass = process.env.STAGING_BASIC_AUTH_PASSWORD;

  // 検証段階のため環境を問わずBasic認証を適用する（変数名の"STAGING_"はstg導入時の名残）。
  // authUser/authPassがCloud Run側に設定されている場合のみ動作する
  if (authUser && authPass) {
    const basicAuth = request.headers.get('authorization');

    if (basicAuth) {
      const authValue = basicAuth.split(' ')[1];
      try {
        const decoded = Buffer.from(authValue, 'base64').toString();
        const [user, password] = decoded.split(':');

        if (user === authUser && password === authPass) {
          return NextResponse.next();
        }
      } catch (e) {
        // デコード失敗時は認証エラーへ
      }
    }

    return new NextResponse('Auth Required.', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Secure Area"',
      },
    });
  }

  return NextResponse.next();
}

// staticファイルや画像、APIルートを除外
// APIルートはFirebase IDトークン（Authorization: Bearer）で別途保護されているため対象外とする。
// Basic認証もAuthorizationヘッダーを使うため、両方を同時に満たすことができず、
// APIルート込みで対象にするとBearerトークン送信時にBasic認証チェックが常に失敗してしまう。
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
