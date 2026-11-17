// 運営からのお知らせ（管理 お知らせ管理仕様書 v2.0）の、画面・API・単体テストで共通の定義と入力チェック。
// DB を使わない純粋な関数だけを置く（tests/unit/notice-shared.test.ts）。

export const NOTICE_TITLE_MAX = 50;
export const NOTICE_BODY_MAX = 2000;
export const NOTICE_LINK_LABEL_MAX = 30;
export const NOTICE_LINK_URL_MAX = 2000;
export const NOTICE_MEMO_MAX = 1000;

/** TOP の「運営からのお知らせ」欄に出す件数（§7.2） */
export const NOTICE_TOP_COUNT = 3;
/** お知らせ一覧（/notices）の1回に読む件数（§7.3） */
export const NOTICE_PAGE_SIZE = 20;

export const NOTICE_STATUSES = [
  { value: 'draft', label: '下書き' },
  { value: 'published', label: '公開中' },
  { value: 'unpublished', label: '非公開' },
] as const;
export type NoticeStatus = (typeof NOTICE_STATUSES)[number]['value'];

export function isNoticeStatus(value: unknown): value is NoticeStatus {
  return NOTICE_STATUSES.some((s) => s.value === value);
}

export function noticeStatusLabel(status: string): string {
  return NOTICE_STATUSES.find((s) => s.value === status)?.label ?? status;
}

/** 添付の種類（§6.3）。並びは編集画面のラジオの順 */
export const NOTICE_ATTACHMENT_TYPES = [
  { value: 'none', label: '添付なし' },
  { value: 'link', label: 'テキストリンクのみ' },
  { value: 'image_link', label: '画像付きテキストリンク' },
  { value: 'youtube', label: 'YouTube 動画' },
] as const;
export type NoticeAttachmentType = (typeof NOTICE_ATTACHMENT_TYPES)[number]['value'];

export function isNoticeAttachmentType(value: unknown): value is NoticeAttachmentType {
  return NOTICE_ATTACHMENT_TYPES.some((t) => t.value === value);
}

/** 画像（決定7。お問い合わせの添付と同じ形式・大きさ） */
export const NOTICE_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const NOTICE_IMAGE_BYTES_MAX = 5 * 1024 * 1024;
/** 保存するときの横幅の上限 */
export const NOTICE_IMAGE_WIDTH_MAX = 1200;
/** 配信 URL のファイル名（`{20文字の英数字}.webp`） */
export const NOTICE_IMAGE_FILE_NAME_RE = /^[A-Za-z0-9]{20}\.webp$/;

export function noticeImageUrl(fileName: string): string {
  return `/api/notices/image/${fileName}`;
}

export const NOTICE_IMAGE_ERRORS = {
  image_type: 'PNG・JPEG・WebPの画像を選んでください',
  image_size: '5MB以下の画像を選んでください',
  image_unreadable: '画像を読み込めませんでした。別の画像を選んでください',
} as const;
export type NoticeImageErrorCode = keyof typeof NOTICE_IMAGE_ERRORS;

export function isNoticeImageErrorCode(value: unknown): value is NoticeImageErrorCode {
  return typeof value === 'string' && value in NOTICE_IMAGE_ERRORS;
}

/** ブラウザで選んだ時点の確認（サーバーは中身で判定し直す） */
export function checkNoticeImageFile(file: { type: string; size: number }): NoticeImageErrorCode | null {
  if (!(NOTICE_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return 'image_type';
  if (file.size > NOTICE_IMAGE_BYTES_MAX) return 'image_size';
  return null;
}

/** 編集画面の入力（保存・公開のときに API へ送る形） */
export interface NoticeInput {
  title: string;
  body: string;
  attachmentType: NoticeAttachmentType;
  linkLabel: string;
  linkUrl: string;
  /** 画像付きテキストリンクの画像（配信 URL のファイル名） */
  imageFileName: string | null;
  /** YouTube 動画の URL（貼られたまま。保存するときに動画 ID を取り出す） */
  youtubeUrl: string;
  notifyBell: boolean;
  important: boolean;
  /** 重要エリアに出す終わり日時（ミリ秒）。null なら「重要」のチェックを外すまで */
  importantUntil: number | null;
  memo: string;
}

export const EMPTY_NOTICE_INPUT: NoticeInput = {
  title: '',
  body: '',
  attachmentType: 'none',
  linkLabel: '',
  linkUrl: '',
  imageFileName: null,
  youtubeUrl: '',
  notifyBell: false,
  important: false,
  importantUntil: null,
  memo: '',
};

export type NoticeInputErrors = Partial<Record<'title' | 'body' | 'linkLabel' | 'linkUrl' | 'image' | 'youtubeUrl' | 'importantUntil' | 'memo', string>>;

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * YouTube の動画 URL から動画 ID を取り出す（§6.3）。読めなければ null。
 * youtube.com/watch?v=・youtu.be/・youtube.com/shorts/・youtube.com/embed/・youtube.com/live/ を受け付ける
 */
export function parseYoutubeVideoId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/);
      id = m ? m[1] : null;
    }
  }
  return id && YOUTUBE_ID_RE.test(id) ? id : null;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** リンク先として受け付ける URL か（https:// の URL か、/ で始まるサイト内のパス。// で始まるものは外部扱いなので断る） */
export function isValidNoticeLinkUrl(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > NOTICE_LINK_URL_MAX) return false;
  if (text.startsWith('/')) return !text.startsWith('//') && !/\s/.test(text);
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && !!url.hostname;
  } catch {
    return false;
  }
}

/** サイトの外へのリンクか（新しいタブで開く） */
export function isExternalNoticeLink(value: string): boolean {
  return !value.trim().startsWith('/');
}

/**
 * 入力のチェック（§6.3 バリデーション）。
 * - `draft`（下書き保存）はタイトルだけ必須にし、ほかは長さだけ見る（書きかけを残せるように）
 * - `publish`（公開・公開中の保存）はすべて見る
 * `now` は重要の終わり日時を「今より後」か比べるため
 */
/**
 * savedImportantUntil: 保存済みの「重要の終わり日時」。同じ値のままなら過去でも通す
 * （終わり日時を過ぎたお知らせの誤字を直すたびに、日時を直させないように）。
 */
export function validateNoticeInput(
  input: NoticeInput,
  mode: 'draft' | 'publish',
  now: number = Date.now(),
  savedImportantUntil: number | null = null,
): NoticeInputErrors {
  const errors: NoticeInputErrors = {};
  const full = mode === 'publish';
  const title = input.title.trim();
  const body = input.body.trim();

  if (!title) errors.title = 'タイトルを入力してください';
  else if (title.length > NOTICE_TITLE_MAX) errors.title = `${NOTICE_TITLE_MAX}文字以内で入力してください`;

  if (body.length > NOTICE_BODY_MAX) errors.body = `${NOTICE_BODY_MAX.toLocaleString()}文字以内で入力してください`;
  else if (full && !body) errors.body = '本文を入力してください';

  if (input.attachmentType === 'link' || input.attachmentType === 'image_link') {
    const label = input.linkLabel.trim();
    if (label.length > NOTICE_LINK_LABEL_MAX) errors.linkLabel = `${NOTICE_LINK_LABEL_MAX}文字以内で入力してください`;
    else if (full && !label) errors.linkLabel = 'リンクの文言を入力してください';

    const url = input.linkUrl.trim();
    if (url && !isValidNoticeLinkUrl(url)) errors.linkUrl = 'https:// で始まるURLか、/ で始まるサイト内のパスを入力してください';
    else if (full && !url) errors.linkUrl = 'URLを入力してください';
  }
  if (input.attachmentType === 'image_link' && full && !input.imageFileName) errors.image = '画像を選んでください';
  if (input.attachmentType === 'youtube') {
    const url = input.youtubeUrl.trim();
    if (url ? !parseYoutubeVideoId(url) : full) errors.youtubeUrl = 'YouTubeの動画のURLを入力してください';
  }

  if (input.important && input.importantUntil !== null && input.importantUntil <= now && input.importantUntil !== savedImportantUntil) {
    errors.importantUntil = '今より後の日時を入力してください';
  }
  if (input.memo.trim().length > NOTICE_MEMO_MAX) errors.memo = `${NOTICE_MEMO_MAX.toLocaleString()}文字以内で入力してください`;
  return errors;
}

/** 利用者に見せるお知らせ（API の応答。備考・作成者などは含めない） */
export interface PublicNotice {
  id: string;
  title: string;
  body: string;
  attachmentType: NoticeAttachmentType;
  linkLabel: string | null;
  linkUrl: string | null;
  imageUrl: string | null;
  youtubeVideoId: string | null;
  /** 重要エリアに今出しているか（終わり日時を過ぎたものは false） */
  important: boolean;
  publishedAt: number;
}

/** 重要エリアに今出すか（§7.1。「重要」が ON で、終わり日時が無いか今より後） */
export function isImportantActive(notice: { important: boolean; importantUntil: number | null }, now: number = Date.now()): boolean {
  return notice.important && (notice.importantUntil === null || notice.importantUntil > now);
}

/** 公開日の表示（2026/11/20）。日本時間で出す */
export function formatNoticeDate(ms: number): string {
  if (!ms) return '';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/** TOP の重要エリアで×を押したお知らせを覚える localStorage のキー（§7.1） */
export const NOTICE_DISMISSED_STORAGE_KEY = 'puremite:dismissed-important-notices';
