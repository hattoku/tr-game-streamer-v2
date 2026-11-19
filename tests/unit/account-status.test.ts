import { describe, expect, it } from 'vitest';
import {
  DEFAULT_USER_FILTER,
  accountStatusOf,
  bucketSignups,
  filterUsers,
  isHiddenUser,
  jstDateKey,
  type AdminUserRowJson,
} from '@/lib/account-status-shared';

function row(overrides: Partial<AdminUserRowJson>): AdminUserRowJson {
  return {
    uid: 'u',
    displayName: 'ユーザー',
    email: 'u@example.com',
    role: 'user',
    isTestUser: false,
    accountStatus: 'active',
    withdrawnBy: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    lastLoginAt: null,
    reviewCount: 0,
    ...overrides,
  };
}

describe('accountStatusOf / isHiddenUser', () => {
  it('フィールドが無い古いアカウントは利用中', () => {
    expect(accountStatusOf({})).toBe('active');
    expect(accountStatusOf(undefined)).toBe('active');
  });
  it('退会中と BAN は他の人から隠す', () => {
    expect(isHiddenUser({ accountStatus: 'withdrawn' })).toBe(true);
    expect(isHiddenUser({ isBanned: true })).toBe(true);
    expect(isHiddenUser({ accountStatus: 'active' })).toBe(false);
  });
});

describe('jstDateKey', () => {
  it('日本時間の日付で区切る（UTC 15:00 は翌日）', () => {
    expect(jstDateKey(Date.parse('2026-11-17T14:59:59Z'))).toBe('2026-11-17');
    expect(jstDateKey(Date.parse('2026-11-17T15:00:00Z'))).toBe('2026-11-18');
  });
});

describe('filterUsers', () => {
  const rows = [
    row({ uid: 'a', displayName: 'Alice', email: 'alice@example.com', createdAt: '2026-11-01T03:00:00Z', lastLoginAt: '2026-11-10T03:00:00Z' }),
    row({ uid: 'b', displayName: 'ボブ', email: 'bob@example.com', accountStatus: 'withdrawn', withdrawnBy: 'self', createdAt: '2026-10-01T03:00:00Z' }),
    row({ uid: 'c', displayName: '運営', email: 'admin@example.com', role: 'owner', createdAt: '2026-09-01T03:00:00Z', lastLoginAt: '2026-11-15T03:00:00Z' }),
  ];

  it('ユーザー名・メールアドレスの部分一致（大文字小文字を区別しない）', () => {
    expect(filterUsers(rows, { ...DEFAULT_USER_FILTER, keyword: 'ALI' }).map((r) => r.uid)).toEqual(['a']);
    expect(filterUsers(rows, { ...DEFAULT_USER_FILTER, keyword: 'bob@' }).map((r) => r.uid)).toEqual(['b']);
  });
  it('状態・種別で絞り込む', () => {
    expect(filterUsers(rows, { ...DEFAULT_USER_FILTER, status: 'withdrawn' }).map((r) => r.uid)).toEqual(['b']);
    expect(filterUsers(rows, { ...DEFAULT_USER_FILTER, role: 'admin' }).map((r) => r.uid)).toEqual(['c']);
    expect(filterUsers(rows, { ...DEFAULT_USER_FILTER, role: 'user' }).map((r) => r.uid)).toEqual(['a', 'b']);
  });
  it('登録日の範囲（両端を含む）と最終ログイン日の範囲（未ログインは外す）', () => {
    expect(filterUsers(rows, { ...DEFAULT_USER_FILTER, createdFrom: '2026-10-01', createdTo: '2026-11-01' }).map((r) => r.uid)).toEqual(['a', 'b']);
    expect(filterUsers(rows, { ...DEFAULT_USER_FILTER, lastLoginFrom: '2026-11-01' }).map((r) => r.uid)).toEqual(['a', 'c']);
  });
  it('並び替え', () => {
    expect(filterUsers(rows, { ...DEFAULT_USER_FILTER, sort: 'createdAsc' }).map((r) => r.uid)).toEqual(['c', 'b', 'a']);
    expect(filterUsers(rows, { ...DEFAULT_USER_FILTER, sort: 'lastLoginDesc' }).map((r) => r.uid)).toEqual(['c', 'a', 'b']);
  });
});

describe('bucketSignups', () => {
  // 2026-11-17（火）21:00 日本時間
  const now = Date.parse('2026-11-17T12:00:00Z');

  it('日別は直近30日、今日が最後、日本時間で数える', () => {
    const buckets = bucketSignups(['2026-11-17T00:00:00Z', '2026-11-16T15:30:00Z', '2026-11-16T14:00:00Z', '2026-10-01T00:00:00Z'], 'day', now);
    expect(buckets).toHaveLength(30);
    expect(buckets.at(-1)).toMatchObject({ start: '2026-11-17', count: 2 });
    expect(buckets.at(-2)).toMatchObject({ start: '2026-11-16', count: 1 });
    expect(buckets[0].start).toBe('2026-10-19');
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(3);
  });
  it('週別は月曜始まりの直近12週', () => {
    const buckets = bucketSignups(['2026-11-16T00:00:00Z', '2026-11-15T10:00:00Z'], 'week', now);
    expect(buckets).toHaveLength(12);
    expect(buckets.at(-1)).toMatchObject({ start: '2026-11-16', count: 1 });
    expect(buckets.at(-2)).toMatchObject({ start: '2026-11-09', count: 1 });
  });
  it('月別は直近12か月で、年をまたぐ', () => {
    const buckets = bucketSignups(['2025-12-31T16:00:00Z', '2026-11-01T00:00:00Z', null], 'month', now);
    expect(buckets).toHaveLength(12);
    expect(buckets[0]).toMatchObject({ start: '2025-12-01', label: '2025/12', count: 0 });
    expect(buckets[1]).toMatchObject({ start: '2026-01-01', count: 1 });
    expect(buckets.at(-1)).toMatchObject({ start: '2026-11-01', count: 1 });
  });
  it('未来の日時は数えない', () => {
    expect(bucketSignups(['2026-11-17T13:00:00Z'], 'day', now).at(-1)?.count).toBe(0);
  });
});
