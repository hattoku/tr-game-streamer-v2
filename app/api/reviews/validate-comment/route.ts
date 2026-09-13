import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';

// レビューコメントのNGワード入力中チェック（レビュー投稿機能仕様書「NGワードの入力禁止」節）。
// firestore.rules は ng_words を管理者以外に非公開としている（回避策を助長しないため）ので、
// クライアント側では判定できない。フォーム側でデバウンスしてこのAPIを呼ぶことで
// 「リアルタイム検出」に近い体験にする。最終送信時は app/api/reviews/upsert 側でも再検証する。
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { text } = (await request.json()) as { text?: string };
  if (typeof text !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const snap = await adminDb.collection('ng_words').get();
  const hasNgWord = snap.docs.some((d) => {
    const word = d.data().word as string | undefined;
    return !!word && text.includes(word);
  });

  return NextResponse.json({ hasNgWord });
}
