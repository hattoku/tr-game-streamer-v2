// 管理画面・審査画面（app/admin/**、components/admin/**）から管理 API（/api/admin/*）を呼ぶ共通の関数（クライアント専用）。
// ログイン中の管理者の ID トークンを `Authorization: Bearer` に付ける。サーバー側は lib/api-auth.ts の requireAdmin で確かめる。
// 管理画面の読み込みの決まり（2026-11-17 リファクタリング③）:
// - 書き込みはすべて管理 API 経由（この関数）。
// - 読み込みは画面ごとの lib/*-admin.ts（collection-admin・workflow-admin・admin-dashboard・inquiry-admin）と lib/admin-reads.ts に置き、
//   画面の部品からは firebase/firestore を直接使わない（eslint.config.mjs の no-restricted-imports で止める）。
import { auth } from './firebase';

/** 管理 API がエラーを返した（`code` は応答の `error`。画面がコードで文言を出し分ける） */
export class AdminApiError extends Error {
  constructor(
    readonly code: string | null,
    readonly status: number,
    readonly body: Record<string, unknown> = {},
  ) {
    super(`admin api ${status} ${code ?? ''}`);
  }
}

/** ID トークンを付けて fetch する（応答はそのまま返す。multipart など JSON 以外を送るとき用） */
export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new AdminApiError('not_signed_in', 401);
  const idToken = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${idToken}`);
  return fetch(path, { cache: 'no-store', ...init, headers });
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** 管理 API を呼び、JSON とステータスを返す（エラーでも例外にしない。応答の中身で分けたいとき用） */
export async function callAdminApi<T = Record<string, unknown>>(
  path: string,
  options: { method?: Method; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; body: T }> {
  const { method = 'POST', body } = options;
  if (!auth.currentUser) return { ok: false, status: 401, body: { error: 'not_signed_in' } as T };
  const res = await adminFetch(path, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, body: json };
}

/** 管理 API を呼び、成功なら JSON を返す。失敗なら AdminApiError を投げる */
export async function requestAdminApi<T = Record<string, unknown>>(path: string, options: { method?: Method; body?: unknown } = {}): Promise<T> {
  const res = await callAdminApi<T & { error?: string }>(path, options);
  if (!res.ok) throw new AdminApiError(typeof res.body?.error === 'string' ? res.body.error : null, res.status, res.body as Record<string, unknown>);
  return res.body;
}

/** 管理 API を POST で呼ぶ（エラーでも例外にしない）。収集の管理画面で使う */
export function postAdminApi<T = Record<string, unknown>>(path: string, body: unknown): Promise<{ ok: boolean; status: number; body: T }> {
  return callAdminApi<T>(path, { method: 'POST', body });
}
