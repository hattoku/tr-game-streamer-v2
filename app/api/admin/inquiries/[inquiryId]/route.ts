import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { readJsonObject } from '@/lib/collections-server';
import { INQUIRY_MEMO_MAX, INQUIRY_REPLY_MAX, isInquiryStatus } from '@/lib/inquiry-shared';

// お問い合わせの管理操作API（管理 お問い合わせ管理仕様書 §4）。operator/owner 共通（§2.1）。
// app/api/admin/workflows/[workflowId]/route.ts と同じく action で操作を分ける。
// - update_status: 4状態を自由に変更（§4.3）。resolved（対応済み）がクローズ状態を兼ねる
// - update_memo: 対応メモの上書き保存（§4.4、1,000字）
// - reply: スレッドへの返信（§4.5、2,000字）。スレッドはログイン済みユーザーのお問い合わせのみ。
//   未対応のまま返信したら対応中へ自動で進める（「対応中＝担当者がスレッドに返信・調査中」§3.4）
// - close / reopen: クローズ→対応済み、管理画面からの再オープン→対応中（§4.5）
// 返信時はユーザー側の未読判定用に lastAdminMessageAt を更新し、サイト内通知（inquiry_reply）を作る（7-3-2）。
// 返信・クローズで awaitingAdminReply（管理画面の「ユーザー返信あり」）を下ろす。メール通知は未実装。
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ inquiryId: string }> }) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { uid } = auth;

  const { inquiryId } = await params;
  const inquiryRef = adminDb.collection('inquiries').doc(inquiryId);
  const inquirySnap = await inquiryRef.get();
  if (!inquirySnap.exists) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const inquiry = inquirySnap.data()!;

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  const now = new Date();

  switch (body.action) {
    case 'update_status': {
      if (!isInquiryStatus(body.status)) return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
      await inquiryRef.update({ status: body.status, updatedAt: now });
      return NextResponse.json({ ok: true });
    }
    case 'update_memo': {
      if (typeof body.operatorMemo !== 'string' || body.operatorMemo.trim().length > INQUIRY_MEMO_MAX) {
        return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
      }
      const operatorMemo = body.operatorMemo.trim() || null;
      await inquiryRef.update({ operatorMemo, updatedAt: now });
      return NextResponse.json({ ok: true });
    }
    case 'reply': {
      const text = typeof body.body === 'string' ? body.body.trim() : '';
      if (!text || text.length > INQUIRY_REPLY_MAX) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
      if (inquiry.isGuest) return NextResponse.json({ error: 'guest_inquiry' }, { status: 409 });
      if (inquiry.status === 'resolved') return NextResponse.json({ error: 'closed' }, { status: 409 });
      const batch = adminDb.batch();
      batch.set(inquiryRef.collection('messages').doc(), { senderId: uid, senderType: 'admin', body: text, sentAt: now });
      batch.update(inquiryRef, {
        status: inquiry.status === 'open' ? 'in_progress' : inquiry.status,
        lastAdminMessageAt: now,
        awaitingAdminReply: false,
        updatedAt: now,
      });
      // お問い合わせ返信通知（ページ ユーザー通知機能仕様書 §2.1）。遷移先は /contact/history/[inquiryId]
      if (inquiry.userId) {
        batch.set(adminDb.collection('notifications').doc(), {
          userId: inquiry.userId,
          type: 'inquiry_reply',
          inquiryId,
          message: 'お問い合わせに返信が届きました',
          isRead: false,
          createdAt: now,
        });
      }
      await batch.commit();
      return NextResponse.json({ ok: true });
    }
    case 'close': {
      await inquiryRef.update({ status: 'resolved', awaitingAdminReply: false, updatedAt: now });
      return NextResponse.json({ ok: true });
    }
    case 'reopen': {
      if (inquiry.status !== 'resolved') return NextResponse.json({ error: 'not_closed' }, { status: 409 });
      await inquiryRef.update({ status: 'in_progress', updatedAt: now });
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }
}
