// お知らせのメール文面（管理 お知らせ管理仕様書 v2.0 §9）。今回は管理画面のプレビューだけで使い、
// 後日のメール送信（Resend）でも同じ文面を使う。DB を使わない純粋な関数（tests/unit/notice-email.test.ts）。
//
// - 件名は「{タイトル} | プレミテ」（件名の決まり。【プレミテ】は使わない）
// - メールでは動画を埋め込めないため、YouTube はサムネイル画像（押すと YouTube）＋「動画を見る」ボタンにする
// - 画像・リンクのサイト内パスは siteOrigin を付けて絶対 URL にする（メールソフトは相対 URL を開けない）
// - 見た目はメールソフト向けに、表組み＋インラインの style だけで組む（外部 CSS・script は使わない）
import { formatNoticeDate, isExternalNoticeLink, noticeImageUrl, youtubeThumbnailUrl, youtubeWatchUrl, type NoticeAttachmentType } from './notice-shared';

export const NOTICE_EMAIL_SENDER_NAME = 'プレミテ';

export interface NoticeEmailSource {
  id: string | null;
  title: string;
  body: string;
  attachmentType: NoticeAttachmentType;
  linkLabel: string;
  linkUrl: string;
  imageFileName: string | null;
  youtubeVideoId: string | null;
  /** 公開日（ミリ秒）。下書きのプレビューでは null（今日の日付で見せる） */
  publishedAt: number | null;
}

export interface NoticeEmail {
  subject: string;
  html: string;
  text: string;
}

export function noticeEmailSubject(title: string): string {
  return `${title.trim() || '（タイトル未入力）'} | プレミテ`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function absoluteUrl(siteOrigin: string, pathOrUrl: string): string {
  return isExternalNoticeLink(pathOrUrl) ? pathOrUrl.trim() : `${siteOrigin.replace(/\/$/, '')}${pathOrUrl.trim()}`;
}

const COLORS = {
  page: '#0f0f0f',
  card: '#191919',
  text: '#e8e8e8',
  sub: '#aaaaaa',
  muted: '#888888',
  brand: '#e03030',
  border: '#2a2a2a',
};

function button(href: string, label: string, primary: boolean): string {
  const style = primary
    ? `background:${COLORS.brand};color:#ffffff;border:1px solid ${COLORS.brand};`
    : `background:#252525;color:${COLORS.text};border:1px solid #3a3a3a;`;
  return `<a href="${escapeHtml(href)}" style="display:inline-block;${style}border-radius:8px;padding:10px 20px;font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(label)}</a>`;
}

export function renderNoticeEmail(source: NoticeEmailSource, options: { siteOrigin: string; now?: number }): NoticeEmail {
  const { siteOrigin } = options;
  const title = source.title.trim() || '（タイトル未入力）';
  const body = source.body.trim();
  const date = formatNoticeDate(source.publishedAt ?? options.now ?? Date.now());
  const detailUrl = source.id ? `${siteOrigin.replace(/\/$/, '')}/notices/${source.id}` : `${siteOrigin.replace(/\/$/, '')}/notices`;
  const label = source.linkLabel.trim();
  const linkUrl = source.linkUrl.trim() ? absoluteUrl(siteOrigin, source.linkUrl) : '';

  const attachmentHtml: string[] = [];
  const attachmentText: string[] = [];
  if ((source.attachmentType === 'link' || source.attachmentType === 'image_link') && linkUrl) {
    if (source.attachmentType === 'image_link' && source.imageFileName) {
      const img = absoluteUrl(siteOrigin, noticeImageUrl(source.imageFileName));
      attachmentHtml.push(
        `<a href="${escapeHtml(linkUrl)}"><img src="${escapeHtml(img)}" alt="${escapeHtml(label)}" width="520" style="display:block;width:100%;max-width:520px;height:auto;border-radius:8px;border:0;" /></a>`,
      );
    }
    attachmentHtml.push(`<div style="margin-top:12px;">${button(linkUrl, label || 'リンクを開く', false)}</div>`);
    attachmentText.push(`${label || 'リンク'}: ${linkUrl}`);
  }
  if (source.attachmentType === 'youtube' && source.youtubeVideoId) {
    const watch = youtubeWatchUrl(source.youtubeVideoId);
    attachmentHtml.push(
      `<a href="${escapeHtml(watch)}"><img src="${escapeHtml(youtubeThumbnailUrl(source.youtubeVideoId))}" alt="動画のサムネイル" width="520" style="display:block;width:100%;max-width:520px;height:auto;border-radius:8px;border:0;" /></a>`,
      `<div style="margin-top:12px;">${button(watch, '動画を見る', false)}</div>`,
    );
    attachmentText.push(`動画を見る: ${watch}`);
  }

  const bodyHtml = escapeHtml(body).replace(/\r?\n/g, '<br />');
  const footer = 'このメールは、プレミテに登録している方にお送りしています。';

  const html = `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(noticeEmailSubject(source.title))}</title></head>
<body style="margin:0;padding:0;background:${COLORS.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans','Noto Sans JP',sans-serif;">
<tr><td style="padding:24px 28px 0;font-size:20px;font-weight:700;color:${COLORS.brand};letter-spacing:0.02em;">プレミテ</td></tr>
<tr><td style="padding:16px 28px 0;font-size:20px;font-weight:600;line-height:1.5;color:${COLORS.text};">${escapeHtml(title)}</td></tr>
<tr><td style="padding:4px 28px 0;font-size:13px;color:${COLORS.muted};">${escapeHtml(date)}</td></tr>
<tr><td style="padding:16px 28px 0;font-size:15px;line-height:1.8;color:${COLORS.text};">${bodyHtml}</td></tr>
${attachmentHtml.length ? `<tr><td style="padding:20px 28px 0;">${attachmentHtml.join('')}</td></tr>` : ''}
<tr><td style="padding:24px 28px 28px;">${button(detailUrl, 'プレミテで見る', true)}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid ${COLORS.border};font-size:12px;line-height:1.7;color:${COLORS.muted};">${escapeHtml(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [title, date, '', body, ...(attachmentText.length ? ['', ...attachmentText] : []), '', `プレミテで見る: ${detailUrl}`, '', '――', footer].join('\n');

  return { subject: noticeEmailSubject(source.title), html, text };
}
