import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const isStaging = process.env.NEXT_PUBLIC_APP_ENV === 'stg';
  const authUser = process.env.STAGING_BASIC_AUTH_USER;
  const authPass = process.env.STAGING_BASIC_AUTH_PASSWORD;

  // 基本的にAPP_ENV=stgの場合にBasic認証を適用する
  // 開発者の利便性のため、authUser/authPassが設定されていない場合はスルーする設定も可能だが
  // 安全のため設定されている場合のみ動作させる
  if (isStaging && authUser && authPass) {
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

// staticファイルや画像などを除外
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
