import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '../../../../lib/firebase-admin';

// 新規サインアップ直後にクライアントから呼び出すエンドポイント。
// Firebase Auth Custom Claimsへの初期role付与と、対応する`users/{uid}`ドキュメントの
// 作成をAdmin SDK（ルールをバイパスできる特権操作）で行う。role はここでのみ 'user' に
// 初期化し、一度設定済みなら上書きしない（管理者が後からoperator/ownerに昇格させた場合に
// このエンドポイントの再呼び出しで巻き戻らないようにするため）。
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!idToken) {
    return NextResponse.json({ error: 'missing bearer token' }, { status: 401 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  }

  const { uid, email } = decoded;
  const userRecord = await adminAuth.getUser(uid);
  const existingRole = userRecord.customClaims?.role;
  if (existingRole) {
    return NextResponse.json({ role: existingRole });
  }

  await adminAuth.setCustomUserClaims(uid, { role: 'user' });

  // ユーザー名・公開設定は本来アカウント作成後の初期設定フローで入力させる項目だが、
  // 「土台」実装では未実装のため、仮の値で作成する（初期設定フロー実装時に上書きされる想定）。
  const placeholderDisplayName = email ? email.split('@')[0] : `user-${uid.slice(0, 8)}`;

  await adminDb.collection('users').doc(uid).set(
    {
      uid,
      displayName: placeholderDisplayName,
      email: email ?? null,
      role: 'user',
      isAI: false,
      isBanned: false,
      isTestUser: false,
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

  return NextResponse.json({ role: 'user' });
}
