// メール内リンクの受け口（/auth/action）で使う、画面に依存しない処理。
// ページ ログイン アカウント登録・ログイン仕様書 §9.4（2026-11-17 追加）。
// Firebase Auth のメール（メールアドレス変更の確認・変更の取り消し・パスワード再設定・メール確認）は、
// Firebase Console のテンプレート設定「アクション URL」をこのページにすると、
// `?mode=…&oobCode=…&apiKey=…&lang=…` を付けてここへ来る。

export type AuthActionMode = 'verifyAndChangeEmail' | 'recoverEmail' | 'resetPassword' | 'verifyEmail';

const MODES: readonly AuthActionMode[] = ['verifyAndChangeEmail', 'recoverEmail', 'resetPassword', 'verifyEmail'];

export interface AuthActionParams {
  mode: AuthActionMode;
  oobCode: string;
}

/** URL のクエリから mode と oobCode を取り出す。知らない mode・コードなしは null（「リンクが無効」画面） */
export function parseAuthActionParams(search: URLSearchParams): AuthActionParams | null {
  const mode = search.get('mode');
  const oobCode = search.get('oobCode')?.trim();
  if (!mode || !oobCode || !(MODES as readonly string[]).includes(mode)) return null;
  return { mode: mode as AuthActionMode, oobCode };
}

/** パスワードの最低文字数（アカウント作成と同じ。ログイン仕様書 §8.2） */
export const MIN_PASSWORD_LENGTH = 8;

export const AUTH_ACTION_MESSAGES = {
  required: '入力してください',
  shortPassword: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`,
  passwordMismatch: 'パスワードが一致しません',
  weakPassword: 'もう少し複雑なパスワードにしてください',
  network: '通信エラーが発生しました。時間をおいて再試行してください',
  tooManyRequests: '試行回数が多すぎます。しばらく待ってから再試行してください',
  generic: '処理に失敗しました。時間をおいて再試行してください',
} as const;

export interface NewPasswordErrors {
  password?: string;
  passwordConfirm?: string;
}

/** 新しいパスワード（確認用つき）の入力チェック */
export function validateNewPassword(password: string, passwordConfirm: string): NewPasswordErrors {
  const errors: NewPasswordErrors = {};
  if (!password) errors.password = AUTH_ACTION_MESSAGES.required;
  else if (password.length < MIN_PASSWORD_LENGTH) errors.password = AUTH_ACTION_MESSAGES.shortPassword;
  if (!passwordConfirm) errors.passwordConfirm = AUTH_ACTION_MESSAGES.required;
  else if (!errors.password && password !== passwordConfirm) errors.passwordConfirm = AUTH_ACTION_MESSAGES.passwordMismatch;
  return errors;
}

/** リンク自体が使えない（期限切れ・使用済み・壊れている）ことを示す Firebase のエラーコード */
export function isInvalidLinkError(code: string): boolean {
  return (
    code === 'auth/invalid-action-code' ||
    code === 'auth/expired-action-code' ||
    code === 'auth/user-disabled' ||
    code === 'auth/user-not-found' ||
    code === 'auth/argument-error'
  );
}

/** リンクが無効なときに、mode ごとに案内する「やり直す場所」 */
export function retryGuide(mode: AuthActionMode | null): { text: string; href: string; label: string } {
  switch (mode) {
    case 'resetPassword':
      return {
        text: 'お手数ですが、もう一度パスワード再設定メールを送ってください。',
        href: '/password-reset',
        label: 'パスワード再設定メールを送る',
      };
    case 'verifyAndChangeEmail':
      return {
        text: 'お手数ですが、設定ページからもう一度メールアドレスの変更をお申し込みください。',
        href: '/settings',
        label: '設定ページへ',
      };
    default:
      return { text: 'お手数ですが、ログインしてもう一度お試しください。', href: '/login', label: 'ログインページへ' };
  }
}
