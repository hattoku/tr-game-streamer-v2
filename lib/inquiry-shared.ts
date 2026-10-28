// お問い合わせ（ページ お問い合わせフォーム仕様書／管理 お問い合わせ管理仕様書）のクライアント・サーバー共通の定義。
// 種別・ステータスの表示名と、フォームと POST /api/inquiries の両方で使う入力チェック。
// データ構造は Firestore データモデル設計書 §3.17。

export type InquiryCategory = 'bug' | 'account' | 'content' | 'feedback' | 'other';

/** 種別と、選択時にセレクト直下へ出す補足テキスト（フォーム仕様書 §4）。並びはフォームの選択肢順 */
export const INQUIRY_CATEGORIES: ReadonlyArray<{ value: InquiryCategory; label: string; hint: string }> = [
  { value: 'bug', label: '不具合・バグ報告', hint: 'サービスの動作に関する不具合・バグのご報告' },
  { value: 'account', label: 'アカウントについて', hint: 'ログイン・退会・アカウント情報に関するお問い合わせ' },
  { value: 'content', label: '掲載内容について', hint: '誤情報・権利侵害・不適切なコンテンツ等に関するご連絡' },
  { value: 'feedback', label: 'ご意見・ご要望', hint: 'サービスへのご意見・新機能のご要望' },
  { value: 'other', label: 'その他', hint: '上記に該当しないお問い合わせ' },
];

export function isInquiryCategory(value: unknown): value is InquiryCategory {
  return INQUIRY_CATEGORIES.some((c) => c.value === value);
}

export function inquiryCategoryLabel(value: string): string {
  return INQUIRY_CATEGORIES.find((c) => c.value === value)?.label ?? 'その他';
}

/**
 * ステータス（管理仕様書 §3.4）。`resolved`（対応済み）がスレッドのクローズ状態を兼ねる
 * （「対応済み＝スレッドがクローズされた状態」）。
 */
export type InquiryStatus = 'open' | 'in_progress' | 'on_hold' | 'resolved';

export const INQUIRY_STATUSES: ReadonlyArray<{ value: InquiryStatus; label: string }> = [
  { value: 'open', label: '未対応' },
  { value: 'in_progress', label: '対応中' },
  { value: 'on_hold', label: '保留中' },
  { value: 'resolved', label: '対応済み' },
];

export function isInquiryStatus(value: unknown): value is InquiryStatus {
  return INQUIRY_STATUSES.some((s) => s.value === value);
}

export function inquiryStatusLabel(value: string): string {
  return INQUIRY_STATUSES.find((s) => s.value === value)?.label ?? '未対応';
}

export const INQUIRY_BODY_MAX = 2000;
export const INQUIRY_URLS_MAX = 5;
/** 管理画面の返信（管理仕様書 §4.5）と対応メモ（§4.4）の上限 */
export const INQUIRY_REPLY_MAX = 2000;
export const INQUIRY_MEMO_MAX = 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/\S+$/;

export interface InquiryInput {
  category: string;
  body: string;
  /** 空欄の行も含めて渡してよい（空欄は無視する、§5） */
  relatedUrls: string[];
  email: string;
  /**
   * メールアドレス欄を検証するか。未ログイン、またはアカウントにメールアドレスが無いときだけ true
   * （ログイン済みはサーバー側でアカウントのメールアドレスを使うため検証しない）
   */
  requireEmail: boolean;
}

export interface InquiryInputErrors {
  category?: string;
  body?: string;
  email?: string;
  /** 入力欄の位置（空欄を含む元の配列の添字）→ エラー文言 */
  relatedUrls?: Record<number, string>;
}

/** フォーム仕様書 §6 の文言で検証する。エラーが無ければ空オブジェクト */
export function validateInquiryInput(input: InquiryInput): InquiryInputErrors {
  const errors: InquiryInputErrors = {};
  if (!isInquiryCategory(input.category)) errors.category = 'お問い合わせ種別を選択してください';

  const body = input.body.trim();
  if (!body) errors.body = 'お問い合わせ内容を入力してください';
  else if (body.length > INQUIRY_BODY_MAX) errors.body = '2,000文字以内で入力してください';

  if (input.requireEmail) {
    const email = input.email.trim();
    if (!email) errors.email = 'メールアドレスを入力してください';
    else if (!EMAIL_RE.test(email)) errors.email = '正しいメールアドレスの形式で入力してください';
  }

  const urlErrors: Record<number, string> = {};
  input.relatedUrls.forEach((url, i) => {
    const trimmed = url.trim();
    if (trimmed && !URL_RE.test(trimmed)) urlErrors[i] = '正しいURL形式で入力してください';
  });
  if (Object.keys(urlErrors).length > 0) errors.relatedUrls = urlErrors;

  return errors;
}

export function hasInquiryErrors(errors: InquiryInputErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** 送信対象の関連URL（空欄を除き trim したもの） */
export function normalizeRelatedUrls(urls: string[]): string[] {
  return urls.map((u) => u.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// 添付画像（ページ お問い合わせフォーム仕様書 §9）。ログイン済みユーザーだけが、フォームの送信とスレッドの返信に付けられる
// ---------------------------------------------------------------------------

export type InquiryAttachmentFormat = 'png' | 'jpeg' | 'webp';

/** 受け付ける形式（§9.2）。ブラウザの事前チェックとファイル選択の accept に使う。サーバーは MIME を信じず先頭バイトで判定する */
export const INQUIRY_ATTACHMENT_MIME_TYPES: Readonly<Record<string, InquiryAttachmentFormat>> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
};
export const INQUIRY_ATTACHMENT_EXTENSIONS: Readonly<Record<InquiryAttachmentFormat, string>> = { png: 'png', jpeg: 'jpg', webp: 'webp' };
export const INQUIRY_ATTACHMENTS_MAX = 3;
export const INQUIRY_ATTACHMENT_BYTES_MAX = 5 * 1024 * 1024;
export const INQUIRY_ATTACHMENTS_DAILY_MAX = 20;

/** API のエラーコード → §9.4 の文言。フォーム・スレッドの返信欄で共用する */
export const INQUIRY_ATTACHMENT_ERRORS = {
  attachment_type: 'PNG・JPEG・WebP の画像を選択してください',
  attachment_size: '1枚5MB以内の画像を選択してください',
  attachment_count: '画像は3枚まで添付できます',
  attachment_unreadable: '画像を読み込めませんでした。別の画像を選択してください',
  attachment_daily_limit: '本日添付できる画像の上限（20枚）に達しました。明日以降に送信してください',
  attachment_guest: 'ログインすると画像を添付できます',
} as const;
export type InquiryAttachmentErrorCode = keyof typeof INQUIRY_ATTACHMENT_ERRORS;

export function isInquiryAttachmentErrorCode(value: unknown): value is InquiryAttachmentErrorCode {
  return typeof value === 'string' && value in INQUIRY_ATTACHMENT_ERRORS;
}

/** ブラウザで選んだ時点の確認（§9.4）。形式は申告された MIME で見る（サーバーは中身で判定し直す） */
export function checkAttachmentFiles(files: ReadonlyArray<{ type: string; size: number }>): InquiryAttachmentErrorCode | null {
  if (files.length > INQUIRY_ATTACHMENTS_MAX) return 'attachment_count';
  if (files.some((f) => !(f.type in INQUIRY_ATTACHMENT_MIME_TYPES))) return 'attachment_type';
  if (files.some((f) => f.size > INQUIRY_ATTACHMENT_BYTES_MAX)) return 'attachment_size';
  return null;
}

/** 画面に渡す添付画像の情報（Firestore データモデル設計書 §3.17「添付画像」） */
export interface InquiryAttachmentJson {
  id: string;
  format: InquiryAttachmentFormat;
  width: number;
  height: number;
  /** 保存期間（対応済みから180日）を過ぎて画像を削除済み */
  deleted: boolean;
}

/** Storage 上のファイル名（`inquiries/{inquiryId}/` の下）。閲覧 API の URL にも使う */
export function inquiryAttachmentFileName(attachment: Pick<InquiryAttachmentJson, 'id' | 'format'>): string {
  return `${attachment.id}.${INQUIRY_ATTACHMENT_EXTENSIONS[attachment.format]}`;
}

/** Firestore の `attachments` を画面用に読み替える。形の崩れた要素は捨てる */
export function parseInquiryAttachments(raw: unknown): InquiryAttachmentJson[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a) => {
    if (!a || typeof a !== 'object') return [];
    const { id, format, width, height, deletedAt } = a as Record<string, unknown>;
    if (typeof id !== 'string' || (format !== 'png' && format !== 'jpeg' && format !== 'webp')) return [];
    return [{ id, format, width: Number(width) || 0, height: Number(height) || 0, deleted: deletedAt != null }];
  });
}

/** ユーザー側の履歴・スレッド（ページ お問い合わせ履歴 仕様書 §1.1）で API が返す形。日時はミリ秒 */
export interface UserInquirySummaryJson {
  id: string;
  category: string;
  status: InquiryStatus;
  body: string;
  submittedAt: number;
  /** 管理者からの未読の返信がある（lastAdminMessageAt > userLastReadAt） */
  hasUnread: boolean;
}

export interface InquiryMessageJson {
  id: string;
  senderType: 'user' | 'admin';
  body: string;
  attachments: InquiryAttachmentJson[];
  sentAt: number;
}

export interface UserInquiryDetailJson {
  id: string;
  category: string;
  status: InquiryStatus;
  body: string;
  relatedUrls: string[];
  attachments: InquiryAttachmentJson[];
  submittedAt: number;
  messages: InquiryMessageJson[];
}
