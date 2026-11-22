/**
 * ユーザー一覧（/admin/users）。管理 ユーザー管理仕様書 §3.1・§3.7。オーナー・運営者。
 * 全件を管理 API から受け取り（Firebase Auth の記録と users を合わせたもの）、絞り込み・並び替え・20件ページング・
 * 新規登録の推移グラフは画面側で行う（件数が少ないうちの簡易実装。/admin/inquiries と同じ方針）。
 * 管理者（オーナー・運営者）も印を付けて載せる（2026-11-17 ユーザー決定）。グラフは一般ユーザーだけを数える。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchAdminUsers } from '@/lib/admin-users';
import {
  DEFAULT_USER_FILTER,
  filterUsers,
  type AdminUserRowJson,
  type RoleFilter,
  type SortKey,
  type StatusFilter,
  type UserFilter,
} from '@/lib/account-status-shared';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeading } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { SelectMenu } from '@/components/ui/DropdownMenu';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ChevronDownIcon, ChevronUpIcon, UserIcon } from '@/components/ui/icons';
import { SignupChart } from '@/components/admin/users/SignupChart';
import { RoleBadge, StatusTag, formatDateTime } from '@/components/admin/users/labels';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'すべて' },
  { value: 'active', label: '利用中' },
  { value: 'withdrawn', label: '退会済み' },
];
const ROLE_OPTIONS: Array<{ value: RoleFilter; label: string }> = [
  { value: 'all', label: 'すべて' },
  { value: 'user', label: '一般ユーザー' },
  { value: 'owner', label: 'オーナー' },
  { value: 'operator', label: '運営者' },
];
const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'createdDesc', label: '登録が新しい順' },
  { value: 'createdAsc', label: '登録が古い順' },
  { value: 'lastLoginDesc', label: '最終ログインが新しい順' },
  { value: 'lastLoginAsc', label: '最終ログインが古い順' },
  { value: 'nameAsc', label: 'ユーザー名順' },
];

export default function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUserRowJson[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<UserFilter>(DEFAULT_USER_FILTER);
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setRows(await fetchAdminUsers());
      } catch {
        setLoadError(true);
      }
    })();
  }, []);

  const filtered = useMemo(() => (rows ? filterUsers(rows, filter) : []), [rows, filter]);
  const signupDates = useMemo(
    () => (rows ?? []).filter((r) => r.role === 'user' && !r.isTestUser).map((r) => r.createdAt),
    [rows],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const isFiltered = JSON.stringify({ ...filter, sort: '' }) !== JSON.stringify({ ...DEFAULT_USER_FILTER, sort: '' });

  function update<K extends keyof UserFilter>(key: K, value: UserFilter[K]) {
    setFilter((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading>ユーザー</SectionHeading>

      {loadError ? (
        <p className="py-10 text-center text-base text-text-muted">読み込みに失敗しました。ページを再読み込みしてください</p>
      ) : rows === null ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <SkeletonText lines={2} />
            </Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<UserIcon />} title="ユーザーはいません" description="アカウントが作成されると、ここに一覧表示されます" />
      ) : (
        <>
          <SignupChart createdAts={signupDates} />

          {/* 絞り込み（§3.1。複数条件は AND）。検索欄は常に見せ、そのほかの条件はじゃばらに畳む */}
          <Card>
            <div className="flex flex-col gap-3">
              <Input
                type="search"
                placeholder="ユーザー名・メールアドレスで検索"
                aria-label="ユーザー名・メールアドレスで検索"
                value={filter.keyword}
                onChange={(e) => update('keyword', e.target.value)}
                data-testid="user-search"
              />
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left"
                aria-expanded={filterOpen}
                aria-controls="user-filter-panel"
                onClick={() => setFilterOpen((v) => !v)}
                data-testid="user-filter-toggle"
              >
                <span className="text-xl font-medium text-text-primary">
                  絞り込み
                  {isFiltered && <span className="ml-2 text-md font-normal text-text-muted">（条件あり）</span>}
                </span>
                {filterOpen ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
              </button>
              {filterOpen && (
                <div id="user-filter-panel" className="flex flex-col gap-3" data-testid="user-filter-panel">
                  <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
                    <SelectMenu
                      value={filter.status}
                      onValueChange={(v) => update('status', v)}
                      options={STATUS_OPTIONS}
                      prefix="状態:"
                      aria-label="状態で絞り込み"
                      align="start"
                      className="w-full md:w-auto"
                    />
                    <SelectMenu
                      value={filter.role}
                      onValueChange={(v) => update('role', v)}
                      options={ROLE_OPTIONS}
                      prefix="種別:"
                      aria-label="種別で絞り込み"
                      align="start"
                      className="w-full md:w-auto"
                    />
                    <SelectMenu
                      value={filter.sort}
                      onValueChange={(v) => update('sort', v)}
                      options={SORT_OPTIONS}
                      prefix="並び:"
                      aria-label="並び替え"
                      align="start"
                      className="w-full md:w-auto"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <DateRange
                      label="登録日"
                      from={filter.createdFrom}
                      to={filter.createdTo}
                      onFrom={(v) => update('createdFrom', v)}
                      onTo={(v) => update('createdTo', v)}
                    />
                    <DateRange
                      label="最終ログイン日"
                      from={filter.lastLoginFrom}
                      to={filter.lastLoginTo}
                      onFrom={(v) => update('lastLoginFrom', v)}
                      onTo={(v) => update('lastLoginTo', v)}
                    />
                  </div>
                  {isFiltered && (
                    <div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setFilter((prev) => ({ ...DEFAULT_USER_FILTER, sort: prev.sort }));
                          setPage(1);
                        }}
                      >
                        条件をクリア
                      </Button>
                    </div>
                  )}
    
                </div>
              )}
            </div>
          </Card>

          <p className="text-md text-text-muted" data-testid="user-count">
            {filtered.length.toLocaleString()}人
            {isFiltered && ` / 全${rows.length.toLocaleString()}人`}
          </p>

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-base text-text-muted">該当するユーザーはいません</p>
          ) : (
            <ul className="flex flex-col gap-3" data-testid="user-list">
              {pageItems.map((r) => (
                <li key={r.uid}>
                  <Card interactive flush>
                    <Link
                      href={`/admin/users/${encodeURIComponent(r.uid)}`}
                      className="flex w-full min-w-0 flex-col gap-1 px-4 py-3 md:px-[18px] md:py-[14px]"
                      data-testid="user-row"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <StatusTag status={r.accountStatus} withdrawnBy={r.withdrawnBy} />
                          <span className="min-w-0 truncate text-base text-text-primary">{r.displayName}</span>
                          <RoleBadge role={r.role} isTestUser={r.isTestUser} />
                        </div>
                        <span className="text-sm text-text-muted">レビュー {r.reviewCount.toLocaleString()}件</span>
                      </div>
                      <p className="truncate text-md text-text-secondary">{r.email ?? '（メールアドレスなし）'}</p>
                      <p className="flex flex-wrap gap-x-4 text-sm text-text-muted">
                        <span>登録 {formatDateTime(r.createdAt)}</span>
                        <span>最終ログイン {formatDateTime(r.lastLoginAt)}</span>
                      </p>
                    </Link>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} className="mt-4" />
        </>
      )}
    </div>
  );
}

function DateRange({
  label,
  from,
  to,
  onFrom,
  onTo,
}: {
  label: string;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-[6px]">
      <legend className="mb-[6px] text-md text-text-tertiary">{label}</legend>
      <div className="flex items-center gap-2">
        <Input type="date" aria-label={`${label}（から）`} value={from} max={to || undefined} onChange={(e) => onFrom(e.target.value)} className="min-w-0 flex-1" />
        <span className="text-text-muted">〜</span>
        <Input type="date" aria-label={`${label}（まで）`} value={to} min={from || undefined} onChange={(e) => onTo(e.target.value)} className="min-w-0 flex-1" />
      </div>
    </fieldset>
  );
}
