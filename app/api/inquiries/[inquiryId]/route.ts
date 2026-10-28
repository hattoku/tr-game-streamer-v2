import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import {
  InquiryAttachmentError,
  assertDailyQuota,
  attachmentErrorResponse,
  deleteInquiryImages,
  processInquiryImages,
  readInquiryRequest,
  reserveDailyQuota,
  uploadInquiryImages,
  type StoredInquiryAttachment,
} from '@/lib/inquiry-attachments-server';
import {
  INQUIRY_REPLY_MAX,
  inquiryAttachmentFileName,
  isInquiryStatus,
  parseInquiryAttachments,
  type InquiryMessageJson,
  type UserInquiryDetailJson,
} from '@/lib/inquiry-shared';

// 自分のお問い合わせ1件の取得・返信・再オープン（ページ お問い合わせ履歴 仕様書 §4・§5・§1.1）。
// 対応メモ（operatorMemo）等の内部項目は返さない（管理 お問い合わせ管理仕様書 §1.1、2026-10-24 ユーザー決定）。
// 本人以外・存在しない・ゲストのお問い合わせは区別せず 404 にする（他人のIDの存在を明かさない）。

type Params = { params: Promise<{ inquiryId: string }> };

async function loadOwnInquiry(request: NextRequest, params: Params['params']) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return { errorResponse: auth.errorResponse };
  const { inquiryId } = await params;
  const ref = adminDb.collection('inquiries').doc(inquiryId);
  const snap = await ref.get();
  const data = snap.data();
  if (!data || data.userId !== auth.uid || data.isGuest === true) {
    return { errorResponse: NextResponse.json({ error: 'not_found' }, { status: 404 }) };
  }
  return { ref, data };
}

export async function GET(request: NextRequest, { params }: Params) {
  const loaded = await loadOwnInquiry(request, params);
  if ('errorResponse' in loaded) return loaded.errorResponse;
  const { ref, data } = loaded;

  const messageSnap = await ref.collection('messages').orderBy('sentAt', 'asc').get();
  const messages: InquiryMessageJson[] = messageSnap.docs.map((d) => {
    const m = d.data();
    return {
      id: d.id,
      senderType: m.senderType === 'admin' ? 'admin' : 'user',
      body: (m.body as string) ?? '',
      attachments: parseInquiryAttachments(m.attachments),
      sentAt: m.sentAt?.toMillis?.() ?? 0,
    };
  });

  // スレッドを開いた時点で既読にする（未読インジケーター、§1.1）。通知一覧を経由せずに開いた場合もベルの未読数が残らないよう、
  // このお問い合わせの未読の返信通知も既読にする（等価条件のみのため複合インデックス不要）
  const unreadNotifications = await adminDb
    .collection('notifications')
    .where('userId', '==', data.userId)
    .where('inquiryId', '==', ref.id)
    .where('isRead', '==', false)
    .get();
  const batch = adminDb.batch();
  batch.update(ref, { userLastReadAt: new Date() });
  unreadNotifications.docs.forEach((d) => batch.update(d.ref, { isRead: true }));
  await batch.commit();

  const inquiry: UserInquiryDetailJson = {
    id: ref.id,
    category: (data.category as string) ?? 'other',
    status: isInquiryStatus(data.status) ? data.status : 'open',
    body: (data.body as string) ?? '',
    relatedUrls: Array.isArray(data.relatedUrls) ? (data.relatedUrls as string[]) : [],
    attachments: parseInquiryAttachments(data.attachments),
    submittedAt: data.submittedAt?.toMillis?.() ?? 0,
    messages,
  };
  return NextResponse.json({ inquiry });
}

// - reply: スレッドへの送信（2,000字）。クローズ済み（対応済み）は 409。管理画面の「ユーザー返信あり」のため
//   awaitingAdminReply を立てる（管理者への通知が未実装のため。管理 お問い合わせ管理仕様書 §1.1、ユーザー決定）。ステータスは変えない
// - reopen: クローズ済みのスレッドを再オープンし、ステータスを「未対応」に戻す（§5）。添付画像の保存期間の起点（resolvedAt）も消す
// reply は画像を添付できる（ページ お問い合わせフォーム仕様書 §9。multipart/form-data、検証と保存の流れは POST /api/inquiries と同じ）
export async function POST(request: NextRequest, { params }: Params) {
  const loaded = await loadOwnInquiry(request, params);
  if ('errorResponse' in loaded) return loaded.errorResponse;
  const { ref, data } = loaded;
  const uid = data.userId as string;

  const parsed = await readInquiryRequest(request);
  if (!parsed) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  if ('errorResponse' in parsed) return parsed.errorResponse;
  const { body, files } = parsed;
  const now = new Date();

  switch (body.action) {
    case 'reply': {
      const text = typeof body.body === 'string' ? body.body.trim() : '';
      if (!text || text.length > INQUIRY_REPLY_MAX) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
      if (data.status === 'resolved') return NextResponse.json({ error: 'closed' }, { status: 409 });

      let attachments: StoredInquiryAttachment[] = [];
      if (files.length > 0) {
        try {
          await assertDailyQuota(uid, files.length, now);
          attachments = await uploadInquiryImages(ref.id, await processInquiryImages(files));
        } catch (e) {
          if (e instanceof InquiryAttachmentError) return attachmentErrorResponse(e.code);
          throw e;
        }
      }

      // 同時に運営がクローズしても「クローズ済みなのにユーザー返信あり」が残らないよう、状態の確認と書き込みをまとめる
      let result: 'ok' | 'closed' | 'daily_limit';
      try {
        result = await adminDb.runTransaction(async (tx) => {
          const current = (await tx.get(ref)).data();
          if (current?.status === 'resolved') return 'closed';
          if (!(await reserveDailyQuota(tx, uid, attachments.length, now))) return 'daily_limit';
          tx.set(ref.collection('messages').doc(), { senderId: uid, senderType: 'user', body: text, attachments, sentAt: now });
          // 自分の送信で既読も進める（直前の運営の返信は読んだうえで送っているため）
          tx.update(ref, {
            awaitingAdminReply: true,
            userLastReadAt: now,
            updatedAt: now,
            ...(attachments.length > 0 ? { hasAttachments: true } : {}),
          });
          return 'ok';
        });
      } catch (e) {
        await deleteInquiryImages(ref.id, attachments.map(inquiryAttachmentFileName));
        throw e;
      }
      if (result !== 'ok') await deleteInquiryImages(ref.id, attachments.map(inquiryAttachmentFileName));
      if (result === 'closed') return NextResponse.json({ error: 'closed' }, { status: 409 });
      if (result === 'daily_limit') return attachmentErrorResponse('attachment_daily_limit');
      return NextResponse.json({ ok: true });
    }
    case 'reopen': {
      if (data.status !== 'resolved') return NextResponse.json({ error: 'not_closed' }, { status: 409 });
      await ref.update({ status: 'open', resolvedAt: null, updatedAt: now });
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }
}
