import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { listAdminUsers } from '@/lib/admin-users-server';

// ユーザー一覧（管理 ユーザー管理仕様書 §3.1）。オーナー・運営者。全件を返し、絞り込み・並び替え・登録推移グラフは画面側で行う
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const users = await listAdminUsers();
  return NextResponse.json({ users });
}
