import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { profileImageUrl } from '@/lib/profile-image-shared';
import { serveProfileImage } from '@/lib/profile-image-server';
import { isHiddenUser } from '@/lib/account-status-shared';

// アイコン（プロフィール画像）の配信（ページ 設定 プロフィール仕様書 §9.5）。ログイン不要。
// Storage はクライアントから読めないため、ここで Admin SDK から読んで返す。
// そのユーザーの現在のアイコンで、ユーザーが BAN・退会中でないときだけ返す（差し替え前の古い URL・BAN済み・退会中は 404）。

type Params = { params: Promise<{ userId: string; fileName: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { userId, fileName } = await params;
  // パスとして解釈される値は Firestore が例外を投げるため、先に 404 にする
  if (!userId || userId.includes('/')) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const data = (await adminDb.collection('users').doc(userId).get()).data();
  if (!data || isHiddenUser(data) || data.profileImageUrl !== profileImageUrl(userId, fileName)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return serveProfileImage(userId, fileName);
}
