// お問い合わせの管理画面（/admin/inquiries 配下）の読み込みと操作（クライアント専用）。管理 お問い合わせ管理仕様書 §3・§4。
// inquiries は rules で管理者だけが一覧を読めるため、読み込みはクライアントSDK、操作（ステータス・対応メモ・返信・クローズ・再オープン）は
// PATCH /api/admin/inquiries/[inquiryId]（lib/admin-api.ts）。管理画面の読み込みの決まりは lib/admin-api.ts の冒頭。
import { collection, doc, getDocs, onSnapshot, orderBy, query, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import { requestAdminApi } from './admin-api';
import { parseInquiryAttachments, type InquiryAttachmentJson, type InquiryStatus } from './inquiry-shared';

function toMillis(value: unknown): number {
  return (value as { toMillis?: () => number } | null | undefined)?.toMillis?.() ?? 0;
}

/** 一覧の1行 */
export interface AdminInquiryRow {
  id: string;
  category: string;
  status: string;
  userName: string | null;
  isGuest: boolean;
  email: string;
  body: string;
  submittedAt: number;
  /** ユーザーが返信して運営がまだ返していない（§1.1、7-3-2） */
  awaitingAdminReply: boolean;
}

/** すべてのお問い合わせ（受付日時の新しい順。絞り込み・ページングは画面側） */
export async function fetchInquiryRows(): Promise<AdminInquiryRow[]> {
  const snap = await getDocs(collection(db, 'inquiries'));
  return snap.docs
    .map((d): AdminInquiryRow => {
      const data = d.data();
      return {
        id: d.id,
        category: (data.category as string) ?? 'other',
        status: (data.status as string) ?? 'open',
        userName: (data.userName as string | null) ?? null,
        isGuest: data.isGuest === true,
        email: (data.email as string) ?? '',
        body: (data.body as string) ?? '',
        submittedAt: toMillis(data.submittedAt),
        awaitingAdminReply: data.awaitingAdminReply === true,
      };
    })
    .sort((a, b) => b.submittedAt - a.submittedAt);
}

export interface AdminInquiryDetail {
  userId: string | null;
  userName: string | null;
  email: string;
  category: string;
  body: string;
  relatedUrls: string[];
  attachments: InquiryAttachmentJson[];
  status: InquiryStatus;
  isGuest: boolean;
  operatorMemo: string | null;
  submittedAt: number;
}

export interface AdminInquiryMessage {
  id: string;
  senderType: 'user' | 'admin';
  body: string;
  attachments: InquiryAttachmentJson[];
  sentAt: number;
}

/** お問い合わせ本体を購読する（無ければ null） */
export function subscribeInquiry(inquiryId: string, onChange: (inquiry: AdminInquiryDetail | null) => void, onError: () => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'inquiries', inquiryId),
    (snap) => {
      if (!snap.exists()) return onChange(null);
      const data = snap.data();
      onChange({
        userId: (data.userId as string | null) ?? null,
        userName: (data.userName as string | null) ?? null,
        email: (data.email as string) ?? '',
        category: (data.category as string) ?? 'other',
        body: (data.body as string) ?? '',
        relatedUrls: Array.isArray(data.relatedUrls) ? (data.relatedUrls as string[]) : [],
        attachments: parseInquiryAttachments(data.attachments),
        status: (data.status as InquiryStatus) ?? 'open',
        isGuest: data.isGuest === true,
        operatorMemo: (data.operatorMemo as string | null) ?? null,
        submittedAt: toMillis(data.submittedAt),
      });
    },
    onError,
  );
}

/** スレッドのメッセージ（`inquiries/{id}/messages`、古い順）を購読する */
export function subscribeInquiryMessages(inquiryId: string, onChange: (messages: AdminInquiryMessage[]) => void, onError: () => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'inquiries', inquiryId, 'messages'), orderBy('sentAt', 'asc')),
    (snap) =>
      onChange(
        snap.docs.map((d): AdminInquiryMessage => {
          const data = d.data();
          return {
            id: d.id,
            senderType: data.senderType === 'admin' ? 'admin' : 'user',
            body: (data.body as string) ?? '',
            attachments: parseInquiryAttachments(data.attachments),
            sentAt: toMillis(data.sentAt),
          };
        }),
      ),
    onError,
  );
}

/** お問い合わせの操作（PATCH /api/admin/inquiries/[inquiryId]）。失敗は AdminApiError */
export async function callInquiryAdminApi(inquiryId: string, body: Record<string, unknown>): Promise<void> {
  await requestAdminApi(`/api/admin/inquiries/${encodeURIComponent(inquiryId)}`, { method: 'PATCH', body });
}
