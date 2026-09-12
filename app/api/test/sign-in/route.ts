/**
 * テストモード用会員としてログインするための使い捨てパスワード発行 API。
 * document/specification/common/共通 uiコンポーネント フロント 仕様書.md §7（テストモードウィジェット）。
 *
 * - `NEXT_PUBLIC_TEST_MODE=true` のビルドでのみ有効（それ以外は 404）。本番デプロイでは設定しない。
 * - テストモード用会員（§7.5）は Firebase Auth に無ければここで自動作成する
 *   （email は `TEST_USER_EMAIL`、既定 `test-user@puremite.test`。role は user、users ドキュメントは isTestUser: true）。
 * - ログインのたびにサーバーがランダムなパスワードを設定し直し、メール＋パスワードを返す。クライアントは
 *   `signInWithEmailAndPassword` する。パスワードは保存も再利用もしない。
 *   （カスタムトークン方式はローカルの ADC（ユーザー認証情報）では署名用サービスアカウントが無く失敗するため不採用）
 */
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '../../../../lib/firebase-admin';

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL ?? 'test-user@puremite.test';
const TEST_USER_DISPLAY_NAME = 'テストユーザー';

export async function POST() {
  if (process.env.NEXT_PUBLIC_TEST_MODE !== 'true') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let userRecord;
  try {
    userRecord = await adminAuth.getUserByEmail(TEST_USER_EMAIL);
  } catch {
    userRecord = await adminAuth.createUser({
      email: TEST_USER_EMAIL,
      emailVerified: true,
      displayName: TEST_USER_DISPLAY_NAME,
    });
  }

  // role は init-user API と同じく user。既に付与済みなら触らない（昇格を巻き戻さない）
  if (!userRecord.customClaims?.role) {
    await adminAuth.setCustomUserClaims(userRecord.uid, { role: 'user' });
  }

  // users ドキュメント（フィールド構成は app/api/auth/init-user/route.ts と同じ）。isTestUser のみ true
  await adminDb.collection('users').doc(userRecord.uid).set(
    {
      uid: userRecord.uid,
      displayName: TEST_USER_DISPLAY_NAME,
      email: TEST_USER_EMAIL,
      role: userRecord.customClaims?.role ?? 'user',
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
  return NextResponse.json({ email: TEST_USER_EMAIL, password });
}
