import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { syncUserDenormalizedFields } from '@/lib/profile-server';
import { profileImageFileNameFromUrl, profileImageUrl } from '@/lib/profile-image-shared';
import {
  PROFILE_IMAGE_REQUEST_BYTES_MAX,
  ProfileImageError,
  deleteProfileImage,
  processProfileImage,
  profileImageErrorResponse,
  uploadProfileImage,
} from '@/lib/profile-image-server';

// アイコン（プロフィール画像）の設定・解除（ページ 設定 プロフィール仕様書 §9.2・§9.5）。本人のみ。
// 変えたら、自分の reviews・collections の非正規化コピー（userProfileImageUrl）も揃える（表示名と同じ扱い）。
// 前の画像は users を書き換えた後に消す（1人1枚だけ残る）。

type Params = { params: Promise<{ userId: string }> };

async function authorize(request: NextRequest, userId: string): Promise<NextResponse | null> {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  if (auth.uid !== userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return null;
}

/** users.profileImageUrl を差し替え、前の値を返す。ユーザーが無い・BAN済みなら null */
async function swapProfileImageUrl(userId: string, next: string | null): Promise<{ previous: unknown } | null> {
  const userRef = adminDb.collection('users').doc(userId);
  return adminDb.runTransaction(async (tx) => {
    const data = (await tx.get(userRef)).data();
    if (!data || data.isBanned === true) return null;
    tx.update(userRef, { profileImageUrl: next });
    return { previous: data.profileImageUrl ?? null };
  });
}

/** multipart/form-data の `image` に画像1枚 */
export async function PUT(request: NextRequest, { params }: Params) {
  const { userId } = await params;
  const denied = await authorize(request, userId);
  if (denied) return denied;

  if (!(request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  // 大きさの分からない送信（チャンク転送）は、本文を全部読み込む前に断れないので受け付けない
  const length = Number(request.headers.get('content-length'));
  if (!Number.isFinite(length) || length <= 0) return NextResponse.json({ error: 'length_required' }, { status: 411 });
  if (length > PROFILE_IMAGE_REQUEST_BYTES_MAX) return profileImageErrorResponse('image_size');
  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  let data: Buffer;
  try {
    data = await processProfileImage(file);
  } catch (e) {
    if (e instanceof ProfileImageError) return profileImageErrorResponse(e.code);
    throw e;
  }

  const fileName = await uploadProfileImage(userId, data);
  const url = profileImageUrl(userId, fileName);
  let swapped: { previous: unknown } | null;
  try {
    swapped = await swapProfileImageUrl(userId, url);
  } catch (e) {
    await deleteProfileImage(userId, fileName);
    throw e;
  }
  if (!swapped) {
    await deleteProfileImage(userId, fileName);
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  await deleteProfileImage(userId, profileImageFileNameFromUrl(userId, swapped.previous));
  await syncUserDenormalizedFields(userId, { userProfileImageUrl: url }, 'avatar PUT');
  return NextResponse.json({ profileImageUrl: url });
}

/** アイコンを外す（未設定のシルエット表示に戻す） */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { userId } = await params;
  const denied = await authorize(request, userId);
  if (denied) return denied;

  const swapped = await swapProfileImageUrl(userId, null);
  if (!swapped) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await deleteProfileImage(userId, profileImageFileNameFromUrl(userId, swapped.previous));
  await syncUserDenormalizedFields(userId, { userProfileImageUrl: null }, 'avatar DELETE');
  return NextResponse.json({ profileImageUrl: null });
}
