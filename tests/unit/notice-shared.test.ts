// 運営からのお知らせの入力チェックと表示の判定（lib/notice-shared.ts）。管理 お知らせ管理仕様書 v2.0 §6.3・§7.1。
import { describe, expect, it } from 'vitest';
import {
  EMPTY_NOTICE_INPUT,
  NOTICE_BODY_MAX,
  NOTICE_TITLE_MAX,
  checkNoticeImageFile,
  formatNoticeDate,
  isExternalNoticeLink,
  isImportantActive,
  isValidNoticeLinkUrl,
  parseYoutubeVideoId,
  validateNoticeInput,
  type NoticeInput,
} from '@/lib/notice-shared';

const base: NoticeInput = { ...EMPTY_NOTICE_INPUT, title: 'メンテナンスのお知らせ', body: '本文です' };
const NOW = Date.UTC(2026, 10, 20, 3, 0, 0);

describe('validateNoticeInput（§6.3 バリデーション）', () => {
  it('タイトルが空なら下書きでも保存できない', () => {
    expect(validateNoticeInput({ ...EMPTY_NOTICE_INPUT }, 'draft').title).toBe('タイトルを入力してください');
  });

  it('下書き保存はタイトルだけあればよい（本文・添付は公開するときに見る）', () => {
    const input: NoticeInput = { ...EMPTY_NOTICE_INPUT, title: '書きかけ', attachmentType: 'image_link' };
    expect(validateNoticeInput(input, 'draft')).toEqual({});
    const errors = validateNoticeInput(input, 'publish');
    expect(errors.body).toBe('本文を入力してください');
    expect(errors.linkLabel).toBe('リンクの文言を入力してください');
    expect(errors.linkUrl).toBe('URLを入力してください');
    expect(errors.image).toBe('画像を選んでください');
  });

  it('タイトル・本文の文字数の上限', () => {
    const errors = validateNoticeInput({ ...base, title: 'あ'.repeat(NOTICE_TITLE_MAX + 1), body: 'あ'.repeat(NOTICE_BODY_MAX + 1) }, 'draft');
    expect(errors.title).toBe('50文字以内で入力してください');
    expect(errors.body).toBe('2,000文字以内で入力してください');
    expect(validateNoticeInput({ ...base, title: 'あ'.repeat(NOTICE_TITLE_MAX) }, 'publish')).toEqual({});
  });

  it('リンクの URL は https:// か / で始まるサイト内のパスだけ', () => {
    const link = { ...base, attachmentType: 'link' as const, linkLabel: 'くわしくはこちら' };
    expect(validateNoticeInput({ ...link, linkUrl: 'https://example.com/a' }, 'publish')).toEqual({});
    expect(validateNoticeInput({ ...link, linkUrl: '/playlists' }, 'publish')).toEqual({});
    expect(validateNoticeInput({ ...link, linkUrl: 'http://example.com' }, 'publish').linkUrl).toMatch(/https:\/\//);
    expect(validateNoticeInput({ ...link, linkUrl: 'javascript:alert(1)' }, 'publish').linkUrl).toBeDefined();
    expect(validateNoticeInput({ ...link, linkUrl: '//evil.example.com' }, 'publish').linkUrl).toBeDefined();
  });

  it('添付なしに切り替えたら、残っているリンクの入力は見ない', () => {
    expect(validateNoticeInput({ ...base, attachmentType: 'none', linkUrl: 'not a url' }, 'publish')).toEqual({});
  });

  it('YouTube は読める URL が必要', () => {
    const yt = { ...base, attachmentType: 'youtube' as const };
    expect(validateNoticeInput({ ...yt, youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }, 'publish')).toEqual({});
    expect(validateNoticeInput({ ...yt, youtubeUrl: 'https://example.com' }, 'publish').youtubeUrl).toBe('YouTubeの動画のURLを入力してください');
    expect(validateNoticeInput({ ...yt, youtubeUrl: '' }, 'publish').youtubeUrl).toBeDefined();
    expect(validateNoticeInput({ ...yt, youtubeUrl: '' }, 'draft')).toEqual({});
  });

  it('重要の終わり日時は今より後でないといけない（空はよい）', () => {
    const imp = { ...base, important: true };
    expect(validateNoticeInput({ ...imp, importantUntil: null }, 'publish', NOW)).toEqual({});
    expect(validateNoticeInput({ ...imp, importantUntil: NOW + 60_000 }, 'publish', NOW)).toEqual({});
    expect(validateNoticeInput({ ...imp, importantUntil: NOW - 60_000 }, 'publish', NOW).importantUntil).toBe('今より後の日時を入力してください');
    // 保存済みの終わり日時のままなら、過ぎていても保存できる（誤字直しのたびに日時を直させない）
    expect(validateNoticeInput({ ...imp, importantUntil: NOW - 60_000 }, 'publish', NOW, NOW - 60_000)).toEqual({});
  });

  it('備考は1,000文字まで', () => {
    expect(validateNoticeInput({ ...base, memo: 'あ'.repeat(1001) }, 'draft').memo).toBe('1,000文字以内で入力してください');
  });
});

describe('parseYoutubeVideoId（§6.3、どの動画でもよい）', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s&list=PLxxx', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('%s → %s', (url, id) => {
    expect(parseYoutubeVideoId(url)).toBe(id);
  });

  it.each(['', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/playlist?list=PLxxx', 'https://youtu.be/short', 'not a url'])('読めない: %s', (url) => {
    expect(parseYoutubeVideoId(url)).toBeNull();
  });
});

describe('isImportantActive（§7.1 重要エリアに今出すか）', () => {
  it('重要が ON で、終わり日時が空か今より後なら出す', () => {
    expect(isImportantActive({ important: true, importantUntil: null }, NOW)).toBe(true);
    expect(isImportantActive({ important: true, importantUntil: NOW + 1 }, NOW)).toBe(true);
  });
  it('終わり日時を過ぎたら、または重要が OFF なら出さない', () => {
    expect(isImportantActive({ important: true, importantUntil: NOW }, NOW)).toBe(false);
    expect(isImportantActive({ important: false, importantUntil: null }, NOW)).toBe(false);
  });
});

describe('小さな判定', () => {
  it('サイト内のパスは同じタブ、それ以外は外部リンク', () => {
    expect(isExternalNoticeLink('/playlists')).toBe(false);
    expect(isExternalNoticeLink('https://example.com')).toBe(true);
    expect(isValidNoticeLinkUrl('/a b')).toBe(false);
  });

  it('画像は PNG・JPEG・WebP の 5MB まで（決定7）', () => {
    expect(checkNoticeImageFile({ type: 'image/png', size: 1000 })).toBeNull();
    expect(checkNoticeImageFile({ type: 'image/gif', size: 1000 })).toBe('image_type');
    expect(checkNoticeImageFile({ type: 'image/webp', size: 5 * 1024 * 1024 + 1 })).toBe('image_size');
  });

  it('公開日は日本時間の 2026/11/20 の形', () => {
    expect(formatNoticeDate(Date.UTC(2026, 10, 19, 16, 0, 0))).toBe('2026/11/20');
    expect(formatNoticeDate(0)).toBe('');
  });
});
