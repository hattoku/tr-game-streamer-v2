// お知らせ管理（/admin/notices 配下）の読み込みと操作（クライアント専用）。管理 お知らせ管理仕様書 v2.0 §5・§6。
// notices は rules で管理者だけが読めるため、読み込みはクライアント SDK、書き込みは管理 API（/api/admin/notices/*、lib/admin-api.ts）。
// 管理画面の読み込みの決まりは lib/admin-api.ts の冒頭。
import { collection, doc, getCountFromServer, getDoc, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { adminFetch, requestAdminApi } from './admin-api';
import { isNoticeAttachmentType, isNoticeStatus, type NoticeInput, type NoticeStatus } from './notice-shared';

function toMillis(value: unknown): number | null {
  const ms = (value as { toMillis?: () => number } | null | undefined)?.toMillis?.();
  return typeof ms === 'number' ? ms : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 一覧の1件（§6.2） */
export interface AdminNoticeRow {
  id: string;
  title: string;
  status: NoticeStatus;
  notifyBell: boolean;
  bellSentCount: number | null;
  important: boolean;
  importantUntil: number | null;
  publishedAt: number | null;
  updatedAt: number;
  updatedBy: string;
}

/** 編集画面で読む1件 */
export interface AdminNoticeDetail extends AdminNoticeRow {
  input: NoticeInput;
  youtubeVideoId: string | null;
  bellSentAt: number | null;
  createdAt: number;
}

function toDetail(id: string, d: Record<string, unknown>): AdminNoticeDetail {
  const attachmentType = isNoticeAttachmentType(d.attachmentType) ? d.attachmentType : 'none';
  const youtubeVideoId = typeof d.youtubeVideoId === 'string' ? d.youtubeVideoId : null;
  const important = d.important === true;
  const importantUntil = toMillis(d.importantUntil);
  return {
    id,
    title: str(d.title),
    status: isNoticeStatus(d.status) ? d.status : 'draft',
    notifyBell: d.notifyBell === true,
    bellSentCount: typeof d.bellSentCount === 'number' ? d.bellSentCount : null,
    important,
    importantUntil,
    publishedAt: toMillis(d.publishedAt),
    updatedAt: toMillis(d.updatedAt) ?? 0,
    updatedBy: str(d.updatedBy),
    youtubeVideoId,
    bellSentAt: toMillis(d.bellSentAt),
    createdAt: toMillis(d.createdAt) ?? 0,
    input: {
      title: str(d.title),
      body: str(d.body),
      attachmentType,
      linkLabel: str(d.linkLabel),
      linkUrl: str(d.linkUrl),
      imageFileName: typeof d.imageFileName === 'string' ? d.imageFileName : null,
      youtubeUrl: str(d.youtubeUrl) || (youtubeVideoId ? `https://www.youtube.com/watch?v=${youtubeVideoId}` : ''),
      notifyBell: d.notifyBell === true,
      important,
      importantUntil,
      memo: str(d.memo),
    },
  };
}

/** すべてのお知らせ（更新日の新しい順。絞り込みは画面側。件数が少ないうちはお問い合わせ一覧と同じく全件読む） */
export async function fetchAdminNoticeRows(): Promise<AdminNoticeRow[]> {
  const snap = await getDocs(collection(db, 'notices'));
  return snap.docs.map((d) => toDetail(d.id, d.data())).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function fetchAdminNotice(id: string): Promise<AdminNoticeDetail | null> {
  const snap = await getDoc(doc(db, 'notices', id));
  return snap.exists() ? toDetail(snap.id, snap.data()) : null;
}

/** 更新者の表示名（users は管理者なら読める）。読めなければ空 */
export async function fetchUserDisplayNames(uids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  await Promise.all(
    [...new Set(uids.filter(Boolean))].map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        const name = snap.data()?.displayName;
        if (typeof name === 'string' && name) names.set(uid, name);
      } catch {
        // 読めなければ出さない
      }
    }),
  );
  return names;
}

export function createNoticeDraft(input: NoticeInput): Promise<{ id: string }> {
  return requestAdminApi<{ id: string }>('/api/admin/notices', { method: 'POST', body: { notice: input } });
}

export function saveNotice(id: string, input: NoticeInput): Promise<{ ok: true }> {
  return requestAdminApi(`/api/admin/notices/${encodeURIComponent(id)}`, { method: 'PATCH', body: { action: 'save', notice: input } });
}

export function publishNotice(id: string, input: NoticeInput): Promise<{ ok: true; bellSentCount: number | null }> {
  return requestAdminApi(`/api/admin/notices/${encodeURIComponent(id)}`, { method: 'PATCH', body: { action: 'publish', notice: input } });
}

export function unpublishNotice(id: string): Promise<{ ok: true }> {
  return requestAdminApi(`/api/admin/notices/${encodeURIComponent(id)}`, { method: 'PATCH', body: { action: 'unpublish' } });
}

export function deleteNoticeDraft(id: string): Promise<{ ok: true }> {
  return requestAdminApi(`/api/admin/notices/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** 会員の人数（公開の確認ダイアログの「ベルで N 人に通知します」の目安。実際に作る数は AI 運営者を除いた分）。数えられなければ null */
export async function countMembers(): Promise<number | null> {
  try {
    return (await getCountFromServer(collection(db, 'users'))).data().count;
  } catch {
    return null;
  }
}

/** 画像を置いてファイル名を返す。失敗したらエラーコード（image_type など）を投げる */
export async function uploadNoticeImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  const res = await adminFetch('/api/admin/notices/images', { method: 'POST', body: form });
  const json = (await res.json().catch(() => ({}))) as { fileName?: string; error?: string };
  if (!res.ok || !json.fileName) throw new Error(json.error ?? 'upload_failed');
  return json.fileName;
}
