// 退会（アカウントは残し、ログインできなくする）とユーザー管理で共用する型・純粋関数（クライアント・サーバー共用）。
// 管理 ユーザー管理仕様書 §3・ページ 設定 仕様書 §8・ページ ログイン アカウント登録・ログイン仕様書 §5.5〜5.6。

export type AccountStatus = 'active' | 'withdrawn';
/**
 * 退会させた者。admin＝管理者（本人では再開できない。2026-11-17 ユーザー決定）。
 * self＝本人は 2026-11-19 より前の退会だけ（それ以降の本人の退会はデータごと消去するので、この状態は作られない）
 */
export type WithdrawnBy = 'self' | 'admin';

/** users ドキュメントから状態を読む。フィールドが無い古いアカウントは利用中 */
export function accountStatusOf(data: { accountStatus?: unknown } | null | undefined): AccountStatus {
  return data?.accountStatus === 'withdrawn' ? 'withdrawn' : 'active';
}

export function withdrawnByOf(data: { withdrawnBy?: unknown } | null | undefined): WithdrawnBy | null {
  return data?.withdrawnBy === 'self' || data?.withdrawnBy === 'admin' ? data.withdrawnBy : null;
}

/**
 * 他の人に見せないユーザーか（公開プロフィール・アイコン・レビュー）。
 * 退会中（Q1: 退会中は隠し、再開で戻す。2026-11-17 ユーザー決定）と、旧仕様の BAN フラグ
 */
export function isHiddenUser(data: { accountStatus?: unknown; isBanned?: unknown } | null | undefined): boolean {
  return accountStatusOf(data) === 'withdrawn' || data?.isBanned === true;
}

/** 退会の理由（任意）の最大文字数 */
export const WITHDRAW_REASON_MAX = 500;
/** 運営用の備考の最大文字数 */
export const ADMIN_NOTE_MAX = 2000;

/** 退会の理由（本人）の選択肢。「その他」は自由記述だけ */
export const SELF_WITHDRAW_REASONS = [
  '使わなくなった',
  '見たい再生リストが見つからない',
  '使い方がわかりにくい',
  '別のアカウントを使う',
  'その他',
] as const;

export type UserRoleLabel = 'owner' | 'operator' | 'user' | 'ai_operator';

/** 管理画面のユーザー一覧の1行（GET /api/admin/users） */
export interface AdminUserRowJson {
  uid: string;
  displayName: string;
  /** Firebase Auth のメールアドレス（正）。無ければ users.email */
  email: string | null;
  role: UserRoleLabel;
  isTestUser: boolean;
  accountStatus: AccountStatus;
  withdrawnBy: WithdrawnBy | null;
  /** ISO 文字列。Firebase Auth の作成日時（無ければ users.accountCreatedAt） */
  createdAt: string | null;
  /** ISO 文字列。Firebase Auth の最終ログイン（最後にトークンを更新した日時。無ければ最終サインイン） */
  lastLoginAt: string | null;
  reviewCount: number;
}

/** 管理画面のユーザー詳細（GET /api/admin/users/[uid]） */
export interface AdminUserDetailJson extends AdminUserRowJson {
  bio: string | null;
  profileImageUrl: string | null;
  withdrawnAt: string | null;
  /** 本人が退会時に選んだ・書いた理由 */
  withdrawReason: string | null;
  /** 管理者が退会させたときの理由（管理者だけが読める） */
  adminWithdrawReason: string | null;
  note: string;
  noteUpdatedAt: string | null;
  noteUpdatedByName: string | null;
  mylistCount: number;
  /** 退会させる・解除する操作ができるか（管理者・AI運営者・テスト用会員は不可） */
  canWithdraw: boolean;
}

// ---------------------------------------------------------------------------
// 一覧の絞り込み（クライアント側で行う。件数が少ないうちは全件を受け取る）
// ---------------------------------------------------------------------------

export type StatusFilter = 'all' | 'active' | 'withdrawn';
export type RoleFilter = 'all' | 'user' | 'owner' | 'operator';
export type SortKey = 'createdDesc' | 'createdAsc' | 'lastLoginDesc' | 'lastLoginAsc' | 'nameAsc';

export interface UserFilter {
  /** ユーザー名・メールアドレスの部分一致（大文字小文字を区別しない） */
  keyword: string;
  status: StatusFilter;
  role: RoleFilter;
  /** YYYY-MM-DD（日本時間の日付）。空なら制限なし */
  createdFrom: string;
  createdTo: string;
  lastLoginFrom: string;
  lastLoginTo: string;
  sort: SortKey;
}

export const DEFAULT_USER_FILTER: UserFilter = {
  keyword: '',
  status: 'all',
  role: 'all',
  createdFrom: '',
  createdTo: '',
  lastLoginFrom: '',
  lastLoginTo: '',
  sort: 'createdDesc',
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 日時を日本時間の日付（YYYY-MM-DD）にする */
export function jstDateKey(ms: number): string {
  return new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function inRange(iso: string | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const key = jstDateKey(Date.parse(iso));
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

function time(iso: string | null): number {
  return iso ? Date.parse(iso) : -Infinity;
}

export function filterUsers(rows: AdminUserRowJson[], filter: UserFilter): AdminUserRowJson[] {
  const keyword = filter.keyword.trim().toLowerCase();
  const result = rows.filter((r) => {
    if (keyword && !r.displayName.toLowerCase().includes(keyword) && !(r.email ?? '').toLowerCase().includes(keyword)) return false;
    if (filter.status !== 'all' && r.accountStatus !== filter.status) return false;
    if (filter.role !== 'all' && r.role !== filter.role) return false;
    if (!inRange(r.createdAt, filter.createdFrom, filter.createdTo)) return false;
    if (!inRange(r.lastLoginAt, filter.lastLoginFrom, filter.lastLoginTo)) return false;
    return true;
  });
  const sorters: Record<SortKey, (a: AdminUserRowJson, b: AdminUserRowJson) => number> = {
    createdDesc: (a, b) => time(b.createdAt) - time(a.createdAt),
    createdAsc: (a, b) => time(a.createdAt) - time(b.createdAt),
    lastLoginDesc: (a, b) => time(b.lastLoginAt) - time(a.lastLoginAt),
    lastLoginAsc: (a, b) => time(a.lastLoginAt) - time(b.lastLoginAt),
    nameAsc: (a, b) => a.displayName.localeCompare(b.displayName, 'ja'),
  };
  return result.sort(sorters[filter.sort]);
}

// ---------------------------------------------------------------------------
// 新規登録の推移（日別・週別・月別）。日本時間で区切る。一般ユーザーだけを数える（Q5、2026-11-17 ユーザー決定）
// ---------------------------------------------------------------------------

export type SignupGranularity = 'day' | 'week' | 'month';

export interface SignupBucket {
  /** 期間の始まり（日本時間の日付 YYYY-MM-DD。月別は YYYY-MM-01） */
  start: string;
  /** グラフの軸に出す短い表記 */
  label: string;
  count: number;
}

/** 区切りの数（日別は直近30日、週別は直近12週、月別は直近12か月） */
export const SIGNUP_BUCKET_COUNTS: Record<SignupGranularity, number> = { day: 30, week: 12, month: 12 };

/** 日本時間の日付キーを「その日の0時（日本時間）」のUTCミリ秒にする */
function jstMidnight(key: string): number {
  return Date.parse(`${key}T00:00:00Z`) - JST_OFFSET_MS;
}

function addMonths(key: string, months: number): string {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** 週の始まり（月曜）の日付キー */
function weekStartKey(ms: number): string {
  const key = jstDateKey(ms);
  const dayOfWeek = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0=日
  const back = (dayOfWeek + 6) % 7;
  return jstDateKey(jstMidnight(key) - back * DAY_MS);
}

function shortLabel(start: string, granularity: SignupGranularity): string {
  const [y, m, d] = start.split('-').map(Number);
  if (granularity === 'month') return `${y}/${m}`;
  return `${m}/${d}`;
}

/**
 * 登録日時（ISO 文字列）の一覧を、`now` を含む直近の区切りごとに数える。古い順に返す。
 * 週は月曜始まり。範囲より前・未来の登録は数えない。
 */
export function bucketSignups(createdAts: Array<string | null>, granularity: SignupGranularity, now: number): SignupBucket[] {
  const n = SIGNUP_BUCKET_COUNTS[granularity];
  const starts: string[] = [];
  if (granularity === 'day') {
    const today = jstMidnight(jstDateKey(now));
    for (let i = n - 1; i >= 0; i--) starts.push(jstDateKey(today - i * DAY_MS));
  } else if (granularity === 'week') {
    const thisWeek = jstMidnight(weekStartKey(now));
    for (let i = n - 1; i >= 0; i--) starts.push(jstDateKey(thisWeek - i * 7 * DAY_MS));
  } else {
    const thisMonth = `${jstDateKey(now).slice(0, 7)}-01`;
    for (let i = n - 1; i >= 0; i--) starts.push(addMonths(thisMonth, -i));
  }
  const index = new Map(starts.map((s, i) => [s, i]));
  const counts = new Array<number>(n).fill(0);
  for (const iso of createdAts) {
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms) || ms > now) continue;
    const key =
      granularity === 'day' ? jstDateKey(ms) : granularity === 'week' ? weekStartKey(ms) : `${jstDateKey(ms).slice(0, 7)}-01`;
    const i = index.get(key);
    if (i !== undefined) counts[i] += 1;
  }
  return starts.map((start, i) => ({ start, label: shortLabel(start, granularity), count: counts[i] }));
}
