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
