/**
 * テストモード用会員としてログインするための使い捨てパスワード発行 API。
 * document/specification/common/共通 uiコンポーネント フロント 仕様書.md §7（テストモードウィジェット）。
 *
 * - `NEXT_PUBLIC_TEST_MODE=true` のビルドでのみ有効（それ以外は 404）。本番デプロイでは設定しない。
 * - リクエストボディ `{ kind: 'user' | 'admin' }` で、一般ユーザー（role user）と管理者（role owner）の
 *   どちらのテスト用会員でログインするかを選ぶ（§7.5）。
 * - テスト用会員は Firebase Auth に無ければここで自動作成する。users ドキュメントは isTestUser: true。
 * - ログインのたびにサーバーがランダムなパスワードを設定し直し、メール＋パスワードを返す。クライアントは
 *   `signInWithEmailAndPassword` する。パスワードは保存も再利用もしない。
 *   （カスタムトークン方式はローカルの ADC（ユーザー認証情報）では署名用サービスアカウントが無く失敗するため不採用）
 */
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '../../../../lib/firebase-admin';

type TestUserKind = 'user' | 'admin';

const TEST_USERS: Record<TestUserKind, { email: string; displayName: string; role: 'user' | 'owner' }> = {
  user: { email: process.env.TEST_USER_EMAIL ?? 'test-user@puremite.test', displayName: 'テストユーザー', role: 'user' },
  admin: { email: process.env.TEST_ADMIN_EMAIL ?? 'test-admin@puremite.test', displayName: 'テスト管理者', role: 'owner' },
};

export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_TEST_MODE !== 'true') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let kind: TestUserKind = 'user';
  try {
    const body = await request.json();
    if (body?.kind === 'admin') kind = 'admin';
  } catch {
    // ボディ無しは一般ユーザー扱い
  }
  const def = TEST_USERS[kind];

  let userRecord;
  try {
    userRecord = await adminAuth.getUserByEmail(def.email);
  } catch {
    userRecord = await adminAuth.createUser({ email: def.email, emailVerified: true, displayName: def.displayName });
  }

  // テスト用会員の role は種別に応じて固定する（一般ユーザー: user、管理者: owner）
  if (userRecord.customClaims?.role !== def.role) {
    await adminAuth.setCustomUserClaims(userRecord.uid, { role: def.role });
  }

  // users ドキュメント（フィールド構成は app/api/auth/init-user/route.ts と同じ）。isTestUser のみ true
  await adminDb.collection('users').doc(userRecord.uid).set(
    {
      uid: userRecord.uid,
      displayName: def.displayName,
      email: def.email,
      role: def.role,
      isAI: false,
      isBanned: false,
      isTestUser: true,
      fcmTokens: [],
      isMylistPublic: true,
      isReviewHistoryPublic: true,
      showNewArrivalNotification: true,
      reviewCount: 0,
      helpfulReceivedCount: 0,
      accountCreatedAt: new Date(),
    },
    { merge: true },
  );

  // 使い捨てパスワードを設定し直して返す（次回の切替でまた上書きされる）
  const password = `${randomUUID()}${randomUUID()}`;
  await adminAuth.updateUser(userRecord.uid, { password });
  return NextResponse.json({ email: def.email, password, kind });
}
