import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { submitChangeProposal } from '@/lib/change-proposal-server';

// 詳細ページ（ゲーム・チャンネル・再生リスト）からの変更の提案を送る（ページ 詳細ページからの変更提案 仕様書 §3・§7）。
// クライアントから workflows に直接書かせず、回数・重複・対象の状態をサーバーで確かめる。
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const raw = await request.json().catch(() => null);
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const result = await submitChangeProposal(auth.uid, body);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, id: result.id });
}
