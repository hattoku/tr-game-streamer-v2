import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { readJsonObject } from '@/lib/request-json';
import { deleteNoticeDraft, noticeErrorResponse, parseNoticeInput, publishNotice, saveNotice, unpublishNotice } from '@/lib/notice-server';

// お知らせ1件の操作（管理 お知らせ管理仕様書 v2.0 §5・§8）。オーナー・運営者。
// PATCH の action で分ける（お問い合わせの管理 API と同じ形）:
// - save: 保存（下書きはタイトルだけ必須、公開中・非公開はすべて必須）
// - publish: 今の入力を保存して公開する／もう一度公開する（初めての公開でベル ON なら会員に通知を作る）
// - unpublish: 非公開にする
// DELETE は下書きだけ消せる。
type Params = { params: Promise<{ noticeId: string }> };

function validId(id: string): boolean {
  return !!id && !id.includes('/');
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { noticeId } = await params;
  if (!validId(noticeId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  try {
    switch (body.action) {
      case 'save':
      case 'publish': {
        const input = parseNoticeInput(body.notice);
        if (!input) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
        if (body.action === 'save') {
          await saveNotice(noticeId, auth.uid, input);
          return NextResponse.json({ ok: true });
        }
        const result = await publishNotice(noticeId, auth.uid, input);
        return NextResponse.json({ ok: true, ...result });
      }
      case 'unpublish':
        await unpublishNotice(noticeId, auth.uid);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
    }
  } catch (e) {
    return noticeErrorResponse(e);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { noticeId } = await params;
  if (!validId(noticeId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    await deleteNoticeDraft(noticeId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return noticeErrorResponse(e);
  }
}
