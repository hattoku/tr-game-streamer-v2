// 管理画面のユーザー管理（/admin/users）のサーバー側の処理（サーバー専用）。管理 ユーザー管理仕様書 §3。
// 件数が少ないうちは Firebase Auth と users を全件読み、絞り込みは画面側で行う（数千件を超えたら索引化を検討）。
// メールアドレス・作成日時・最終ログインは Firebase Auth の記録を正とする（users.lastLoginAt はどこからも書かれていないため）。
import type { UserRecord } from 'firebase-admin/auth';
import { adminAuth, adminDb } from './firebase-admin';
import { ADMIN_USER_RECORDS } from './account-status-server';
import {
  accountStatusOf,
  withdrawnByOf,
  type AdminUserDetailJson,
  type AdminUserRowJson,
  type UserRoleLabel,
} from './account-status-shared';

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = (value as { toDate?: () => Date }).toDate?.() ?? (value instanceof Date ? value : new Date(String(value)));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function roleOf(value: unknown): UserRoleLabel {
  return value === 'owner' || value === 'operator' || value === 'ai_operator' ? value : 'user';
}

/** 最終ログイン: 最後にトークンを更新した日時（ログインしたままの利用も含む）。無ければ最後にサインインした日時 */
function lastLoginOf(record: UserRecord | undefined): string | null {
  return iso(record?.metadata.lastRefreshTime) ?? iso(record?.metadata.lastSignInTime);
}

function toRow(uid: string, data: FirebaseFirestore.DocumentData | undefined, record: UserRecord | undefined): AdminUserRowJson {
  return {
    uid,
    displayName: typeof data?.displayName === 'string' && data.displayName ? data.displayName : (record?.displayName ?? '（名前なし）'),
    email: record?.email ?? (typeof data?.email === 'string' ? data.email : null),
    role: roleOf(record?.customClaims?.role ?? data?.role),
    isTestUser: data?.isTestUser === true,
    accountStatus: accountStatusOf(data),
    withdrawnBy: withdrawnByOf(data),
    createdAt: iso(record?.metadata.creationTime) ?? iso(data?.accountCreatedAt),
    lastLoginAt: lastLoginOf(record),
    reviewCount: typeof data?.reviewCount === 'number' ? data.reviewCount : 0,
  };
}

async function listAllAuthUsers(): Promise<Map<string, UserRecord>> {
  const map = new Map<string, UserRecord>();
  let pageToken: string | undefined;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    page.users.forEach((u) => map.set(u.uid, u));
    pageToken = page.pageToken;
  } while (pageToken);
  return map;
}

/** 一覧（AI運営者は除く。Auth のアカウントが無い users も、users が無い Auth のアカウントも載せる） */
export async function listAdminUsers(): Promise<AdminUserRowJson[]> {
  const [records, usersSnap] = await Promise.all([listAllAuthUsers(), adminDb.collection('users').get()]);
  const rows: AdminUserRowJson[] = [];
  const seen = new Set<string>();
  for (const d of usersSnap.docs) {
    const data = d.data();
    if (data.isAI === true || data.role === 'ai_operator') continue;
    seen.add(d.id);
    rows.push(toRow(d.id, data, records.get(d.id)));
  }
  for (const [uid, record] of records) {
    if (!seen.has(uid)) rows.push(toRow(uid, undefined, record));
  }
  return rows;
}

/** 退会させる・解除する操作ができるか（管理者・AI運営者・テスト用会員は不可。管理 ユーザー管理仕様書 §3.4・§5.3） */
export function canWithdrawUser(row: Pick<AdminUserRowJson, 'role' | 'isTestUser'>): boolean {
  return row.role === 'user' && !row.isTestUser;
}

export async function getAdminUserDetail(uid: string): Promise<AdminUserDetailJson | null> {
  const [userSnap, recordSnap, record, mylistCount] = await Promise.all([
    adminDb.collection('users').doc(uid).get(),
    adminDb.collection(ADMIN_USER_RECORDS).doc(uid).get(),
    adminAuth.getUser(uid).catch(() => undefined),
    adminDb.collection('mylist').where('userId', '==', uid).count().get().then((s) => s.data().count),
  ]);
  const data = userSnap.data();
  if (!data && !record) return null;
  const row = toRow(uid, data, record);
  const extra = recordSnap.data();
  return {
    ...row,
    bio: typeof data?.bio === 'string' && data.bio ? data.bio : null,
    profileImageUrl: typeof data?.profileImageUrl === 'string' && data.profileImageUrl ? data.profileImageUrl : null,
    withdrawnAt: iso(data?.withdrawnAt),
    withdrawReason: typeof data?.withdrawReason === 'string' && data.withdrawReason ? data.withdrawReason : null,
    adminWithdrawReason: typeof extra?.adminWithdrawReason === 'string' && extra.adminWithdrawReason ? extra.adminWithdrawReason : null,
    note: typeof extra?.note === 'string' ? extra.note : '',
    noteUpdatedAt: iso(extra?.noteUpdatedAt),
    noteUpdatedByName: typeof extra?.noteUpdatedByName === 'string' ? extra.noteUpdatedByName : null,
    mylistCount,
    canWithdraw: !!data && canWithdrawUser(row),
  };
}
