// ユーザー側のお問い合わせ履歴（ページ お問い合わせ履歴 仕様書）のクライアント用 API 呼び出し。
// 対応メモを渡さないため Firestore を直接読まず、本人専用の API Route を経由する（管理 お問い合わせ管理仕様書 §1.1）。
import { auth } from './firebase';
import type { UserInquiryDetailJson, UserInquirySummaryJson } from './inquiry-shared';

export class InquiryApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function callInquiryApi<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  if (!auth.currentUser) throw new InquiryApiError('not_signed_in');
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new InquiryApiError(json.error ?? `status_${res.status}`);
  return json;
}

export async function fetchMyInquiries(): Promise<UserInquirySummaryJson[]> {
  const { items } = await callInquiryApi<{ items: UserInquirySummaryJson[] }>('/api/inquiries', 'GET');
  return items;
}

/** 取得と同時にサーバー側で既読にする。本人以外・存在しないIDは InquiryApiError('not_found') */
export async function fetchMyInquiry(inquiryId: string): Promise<UserInquiryDetailJson> {
  const { inquiry } = await callInquiryApi<{ inquiry: UserInquiryDetailJson }>(`/api/inquiries/${encodeURIComponent(inquiryId)}`, 'GET');
  return inquiry;
}

export async function postInquiryAction(inquiryId: string, body: { action: 'reply'; body: string } | { action: 'reopen' }): Promise<void> {
  await callInquiryApi(`/api/inquiries/${encodeURIComponent(inquiryId)}`, 'POST', body);
}
