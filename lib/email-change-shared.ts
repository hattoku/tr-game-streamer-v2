// メールアドレス変更（ページ 設定 仕様書 §4.3）の入力チェック。画面（components/settings/EmailChangeModal.tsx）と
// API（app/api/account/email/check）で同じものを使う。

/** ログイン画面（app/(auth)/login/page.tsx）と同じ形式チェック */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMAIL_CHANGE_MESSAGES = {
  emptyEmail: 'メールアドレスを入力してください',
  invalidEmail: '正しいメールアドレスを入力してください',
  mismatch: 'メールアドレスが一致しません',
  sameAsCurrent: '現在のメールアドレスと同じです',
  alreadyInUse: 'このメールアドレスはすでに使用されています',
  emptyPassword: 'パスワードを入力してください',
  wrongPassword: '現在のパスワードが正しくありません',
  tooManyRequests: '試行回数が多すぎます。しばらく待ってから再試行してください',
  network: '通信エラーが発生しました。時間をおいて再試行してください',
  generic: 'メールの送信に失敗しました。時間をおいて再試行してください',
} as const;

/** 大文字小文字を区別せずに比べる（Firebase Auth もメールアドレスを小文字で扱う） */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface EmailChangeInput {
  newEmail: string;
  confirmEmail: string;
  password: string;
  currentEmail: string | null;
}

export interface EmailChangeErrors {
  newEmail?: string;
  confirmEmail?: string;
  password?: string;
}

/** 送信前のチェック（§4.3 バリデーション表のうち、サーバーに聞かなくてよいもの） */
export function validateEmailChange({ newEmail, confirmEmail, password, currentEmail }: EmailChangeInput): EmailChangeErrors {
  const errors: EmailChangeErrors = {};
  const email = newEmail.trim();
  if (!email) errors.newEmail = EMAIL_CHANGE_MESSAGES.emptyEmail;
  else if (!EMAIL_RE.test(email)) errors.newEmail = EMAIL_CHANGE_MESSAGES.invalidEmail;
  else if (currentEmail && normalizeEmail(email) === normalizeEmail(currentEmail)) errors.newEmail = EMAIL_CHANGE_MESSAGES.sameAsCurrent;

  if (!confirmEmail.trim()) errors.confirmEmail = EMAIL_CHANGE_MESSAGES.emptyEmail;
  else if (!errors.newEmail && normalizeEmail(confirmEmail) !== normalizeEmail(email)) errors.confirmEmail = EMAIL_CHANGE_MESSAGES.mismatch;

  if (!password) errors.password = EMAIL_CHANGE_MESSAGES.emptyPassword;
  return errors;
}
