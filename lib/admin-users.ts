// 管理画面のユーザー管理（/admin/users 配下）の読み込みと操作（クライアント専用）。管理 ユーザー管理仕様書 §3。
// users・Firebase Auth の記録を合わせて返すため、読み込みも管理 API（lib/admin-api.ts）を通す。
import { requestAdminApi } from './admin-api';
import type { AdminUserDetailJson, AdminUserRowJson } from './account-status-shared';

export async function fetchAdminUsers(): Promise<AdminUserRowJson[]> {
  const { users } = await requestAdminApi<{ users: AdminUserRowJson[] }>('/api/admin/users', { method: 'GET' });
  return users;
}

export async function fetchAdminUser(uid: string): Promise<AdminUserDetailJson> {
  const { user } = await requestAdminApi<{ user: AdminUserDetailJson }>(`/api/admin/users/${encodeURIComponent(uid)}`, { method: 'GET' });
  return user;
}

export function updateAdminUserProfile(uid: string, input: { displayName: string; bio: string }): Promise<unknown> {
  return requestAdminApi(`/api/admin/users/${encodeURIComponent(uid)}`, { method: 'PATCH', body: input });
}

export function deleteAdminUserAvatar(uid: string): Promise<unknown> {
  return requestAdminApi(`/api/admin/users/${encodeURIComponent(uid)}/avatar`, { method: 'DELETE' });
}

export function saveAdminUserNote(uid: string, note: string): Promise<{ note: string; noteUpdatedAt: string; noteUpdatedByName: string | null }> {
  return requestAdminApi(`/api/admin/users/${encodeURIComponent(uid)}/note`, { method: 'POST', body: { note } });
}

export function withdrawAdminUser(uid: string, reason: string): Promise<unknown> {
  return requestAdminApi(`/api/admin/users/${encodeURIComponent(uid)}/withdraw`, { method: 'POST', body: { reason } });
}

export function restoreAdminUser(uid: string): Promise<unknown> {
  return requestAdminApi(`/api/admin/users/${encodeURIComponent(uid)}/restore`, { method: 'POST' });
}
