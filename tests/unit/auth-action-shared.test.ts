import { describe, expect, it } from 'vitest';
import { AUTH_ACTION_MESSAGES as M, isInvalidLinkError, parseAuthActionParams, retryGuide, validateNewPassword } from '@/lib/auth-action-shared';

describe('parseAuthActionParams', () => {
  it('知っている mode とコードがあれば取り出す', () => {
    expect(parseAuthActionParams(new URLSearchParams('mode=verifyAndChangeEmail&oobCode=abc&apiKey=x&lang=ja'))).toEqual({
      mode: 'verifyAndChangeEmail',
      oobCode: 'abc',
    });
    expect(parseAuthActionParams(new URLSearchParams('mode=resetPassword&oobCode=xyz'))?.mode).toBe('resetPassword');
  });

  it('mode が知らないもの・コードなし・空は null', () => {
    expect(parseAuthActionParams(new URLSearchParams('mode=signIn&oobCode=abc'))).toBeNull();
    expect(parseAuthActionParams(new URLSearchParams('mode=recoverEmail'))).toBeNull();
    expect(parseAuthActionParams(new URLSearchParams('mode=recoverEmail&oobCode=%20'))).toBeNull();
    expect(parseAuthActionParams(new URLSearchParams(''))).toBeNull();
  });
});

describe('validateNewPassword', () => {
  it('空欄・短い・不一致', () => {
    expect(validateNewPassword('', '')).toEqual({ password: M.required, passwordConfirm: M.required });
    expect(validateNewPassword('short', 'short')).toEqual({ password: M.shortPassword });
    expect(validateNewPassword('longenough', 'longenougX')).toEqual({ passwordConfirm: M.passwordMismatch });
    expect(validateNewPassword('longenough', 'longenough')).toEqual({});
  });
});

describe('isInvalidLinkError / retryGuide', () => {
  it('期限切れ・使用済みはリンク無効として扱う', () => {
    expect(isInvalidLinkError('auth/expired-action-code')).toBe(true);
    expect(isInvalidLinkError('auth/invalid-action-code')).toBe(true);
    expect(isInvalidLinkError('auth/network-request-failed')).toBe(false);
  });

  it('mode ごとにやり直す場所を案内する', () => {
    expect(retryGuide('resetPassword').href).toBe('/password-reset');
    expect(retryGuide('verifyAndChangeEmail').href).toBe('/settings');
    expect(retryGuide(null).href).toBe('/login');
  });
});
