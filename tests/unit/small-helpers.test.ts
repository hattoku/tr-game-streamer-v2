// 画面とサーバーで共用する小さな処理（入力の検証・表示の整形など）。
import { describe, expect, it } from 'vitest';
import { countsAsListed } from '@/lib/listing';
import { formatNewVideos, isFeedNotification } from '@/lib/notification-format';
import { packageImageSrc } from '@/lib/package-image';
import { BIO_MAX, DISPLAY_NAME_MAX, validateProfileInput } from '@/lib/profile-shared';
import { readJsonObject } from '@/lib/request-json';
import { todayJst } from '@/lib/collection-quota-shared';
import { validateInquiryInput } from '@/lib/inquiry-shared';

describe('countsAsListed（件数に数える再生リスト。Firestore データモデル設計書 §3.2）', () => {
  it('listed と、移行前（掲載状態なし）を数える', () => {
    expect(countsAsListed({ listingStatus: 'listed' })).toBe(true);
    expect(countsAsListed({})).toBe(true);
    expect(countsAsListed({ listingStatus: null })).toBe(true);
  });

  it('それ以外の掲載状態は数えない', () => {
    for (const s of ['unconfirmed', 'non_game', 'excluded', 'too_short', 'channel_off']) expect(countsAsListed({ listingStatus: s })).toBe(false);
  });
});

describe('通知の整形（ページ ユーザー通知機能仕様書 §1.2・§2.1）', () => {
  it('増えた動画は先頭の題名と「ほかN本」', () => {
    expect(formatNewVideos(['#6 決戦'], 1)).toBe('#6 決戦');
    expect(formatNewVideos(['#6 決戦', '#7 その後'], 3)).toBe('#6 決戦 ほか2本');
    expect(formatNewVideos([], 2)).toBeNull();
  });

  it('お問い合わせ返信・審査結果は通知一覧に出さない（種別なしの古い通知は出す）', () => {
    expect(isFeedNotification('inquiry_reply')).toBe(false);
    expect(isFeedNotification('review_result')).toBe(false);
    expect(isFeedNotification('series_new')).toBe(true);
    expect(isFeedNotification(undefined)).toBe(true);
  });
});

describe('packageImageSrc（楽天の画像は表示する大きさの解像度にする）', () => {
  it('楽天の画像は _ex を差し替える', () => {
    const url = 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/1234/abc.jpg?_ex=200x200';
    expect(packageImageSrc(url, 'detail')).toBe('https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/1234/abc.jpg?_ex=600x600');
    expect(packageImageSrc(url, 'card')).toContain('_ex=400x400');
  });

  it('楽天以外・URLでないものはそのまま', () => {
    expect(packageImageSrc('https://example.com/a.jpg?_ex=200x200', 'detail')).toBe('https://example.com/a.jpg?_ex=200x200');
    expect(packageImageSrc('/images/noimage.png', 'card')).toBe('/images/noimage.png');
  });
});

describe('validateProfileInput（ページ 設定 プロフィール仕様書 §9.2・§9.4）', () => {
  it('表示名は必須・前後の空白を除いて上限まで、自己紹介は上限まで', () => {
    expect(validateProfileInput({ displayName: 'たろう', bio: '' })).toEqual({});
    expect(validateProfileInput({ displayName: '   ', bio: '' }).displayName).toBe('入力してください');
    expect(validateProfileInput({ displayName: 'あ'.repeat(DISPLAY_NAME_MAX), bio: 'い'.repeat(BIO_MAX) })).toEqual({});
    expect(validateProfileInput({ displayName: 'あ'.repeat(DISPLAY_NAME_MAX + 1), bio: '' }).displayName).toContain(`${DISPLAY_NAME_MAX}文字以内`);
    expect(validateProfileInput({ displayName: 'a', bio: 'い'.repeat(BIO_MAX + 1) }).bio).toContain(`${BIO_MAX}文字以内`);
  });
});

describe('validateInquiryInput（お問い合わせフォーム仕様書 §6）', () => {
  const ok = { category: 'bug', body: '動きません', relatedUrls: [], email: '', requireEmail: false };

  it('正しい入力ならエラーなし', () => {
    expect(validateInquiryInput(ok)).toEqual({});
  });

  it('種別・本文・メールアドレス・関連URLを検証する', () => {
    const errors = validateInquiryInput({ category: 'x', body: ' ', relatedUrls: ['', 'not-url', 'https://ok.example'], email: 'bad', requireEmail: true });
    expect(errors.category).toBe('お問い合わせ種別を選択してください');
    expect(errors.body).toBe('お問い合わせ内容を入力してください');
    expect(errors.email).toBe('正しいメールアドレスの形式で入力してください');
    // 添字は空欄を含む元の配列の位置
    expect(errors.relatedUrls).toEqual({ 1: '正しいURL形式で入力してください' });
  });

  it('ログイン済み（requireEmail=false）はメールアドレスを見ない', () => {
    expect(validateInquiryInput({ ...ok, email: 'bad' })).toEqual({});
  });
});

describe('readJsonObject', () => {
  const req = (body: string) => new Request('http://localhost/', { method: 'POST', body });

  it('オブジェクトなら返す', async () => {
    expect(await readJsonObject(req('{"a":1}'))).toEqual({ a: 1 });
  });

  it('壊れた JSON・配列・null・数は null', async () => {
    for (const body of ['{', '[1]', 'null', '3', '']) expect(await readJsonObject(req(body))).toBeNull();
  });
});

describe('todayJst（クォータの日付は日本時間で区切る。コンテンツ収集機能仕様書 §6）', () => {
  it('UTC 15:00 で日付が変わる', () => {
    expect(todayJst(new Date('2026-11-17T14:59:59Z'))).toBe('2026-11-17');
    expect(todayJst(new Date('2026-11-17T15:00:00Z'))).toBe('2026-11-18');
  });
});
