// お知らせのメール文面（lib/notice-email.ts）。管理 お知らせ管理仕様書 v2.0 §9。今回はプレビューだけで使う。
import { describe, expect, it } from 'vitest';
import { noticeEmailSubject, renderNoticeEmail, type NoticeEmailSource } from '@/lib/notice-email';

const source: NoticeEmailSource = {
  id: 'abc123',
  title: 'メンテナンスのお知らせ',
  body: '11月20日にメンテナンスを行います。\nご迷惑をおかけします。',
  attachmentType: 'none',
  linkLabel: '',
  linkUrl: '',
  imageFileName: null,
  youtubeVideoId: null,
  publishedAt: Date.UTC(2026, 10, 19, 16, 0, 0),
};
const origin = 'https://puremite.net';

describe('件名（§9、件名の決まり）', () => {
  it('末尾に「 | プレミテ」を付ける（【プレミテ】は使わない）', () => {
    expect(noticeEmailSubject('メンテナンスのお知らせ')).toBe('メンテナンスのお知らせ | プレミテ');
    expect(noticeEmailSubject('  ')).toBe('（タイトル未入力） | プレミテ');
  });
});

describe('本文（§9）', () => {
  it('タイトル・日付・本文の改行と「プレミテで見る」（お知らせ詳細へ）を入れる', () => {
    const mail = renderNoticeEmail(source, { siteOrigin: origin });
    expect(mail.html).toContain('メンテナンスのお知らせ');
    expect(mail.html).toContain('2026/11/20');
    expect(mail.html).toContain('11月20日にメンテナンスを行います。<br />ご迷惑をおかけします。');
    expect(mail.html).toContain('href="https://puremite.net/notices/abc123"');
    expect(mail.text).toContain('プレミテで見る: https://puremite.net/notices/abc123');
  });

  it('タイトル・本文の HTML はそのまま出さない（エスケープする）', () => {
    const mail = renderNoticeEmail({ ...source, title: '<script>x</script>', body: 'a & "b"' }, { siteOrigin: origin });
    expect(mail.html).not.toContain('<script>x</script>');
    expect(mail.html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(mail.html).toContain('a &amp; &quot;b&quot;');
  });

  it('サイト内のリンク・画像は絶対 URL にする', () => {
    const mail = renderNoticeEmail(
      { ...source, attachmentType: 'image_link', linkLabel: 'くわしく', linkUrl: '/playlists', imageFileName: 'ABCDEFGHIJKLMNOPQRST.webp' },
      { siteOrigin: origin },
    );
    expect(mail.html).toContain('href="https://puremite.net/playlists"');
    expect(mail.html).toContain('src="https://puremite.net/api/notices/image/ABCDEFGHIJKLMNOPQRST.webp"');
    expect(mail.html).toContain('くわしく');
  });

  it('YouTube は埋め込まず、サムネイル画像と「動画を見る」で YouTube へ', () => {
    const mail = renderNoticeEmail({ ...source, attachmentType: 'youtube', youtubeVideoId: 'dQw4w9WgXcQ' }, { siteOrigin: origin });
    expect(mail.html).not.toContain('<iframe');
    expect(mail.html).toContain('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(mail.html).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
    expect(mail.html).toContain('動画を見る');
  });

  it('下書き（ID がまだ無い）ときは「プレミテで見る」をお知らせ一覧へ', () => {
    const mail = renderNoticeEmail({ ...source, id: null }, { siteOrigin: origin });
    expect(mail.html).toContain('href="https://puremite.net/notices"');
  });
});
