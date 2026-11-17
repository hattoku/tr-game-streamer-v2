import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

// users/{uid}.email（init-user が書くミラー）を Firebase Auth の現在のメールアドレスに合わせる
// （ページ 設定 仕様書 §4.3）。メールアドレスの変更は確認メールのリンク（Firebase 標準の画面）で完了するため
// アプリ側に完了の通知が来ない。設定ページを開いたときにずれていれば、画面がこれを呼ぶ。
// email は本人が直接書けないフィールド（firestore.rules）なので Admin SDK で書く。値は Auth から取り、リクエストの値は使わない。
export async function POST(request: NextRequest) {
  const verified = await requireUser(request);
  if ('errorResponse' in verified) return verified.errorResponse;

  const record = await adminAuth.getUser(verified.uid);
  const email = record.email ?? null;
  const ref = adminDb.collection('users').doc(verified.uid);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ updated: false });
  if (snap.get('email') === email) return NextResponse.json({ updated: false, email });

  await ref.update({ email });
  return NextResponse.json({ updated: true, email });
}
