import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { workflowDecisionHandler } from '@/lib/workflow-decisions';
import { isPendingStatus, normalizeDecisionComment, normalizeOperatorMemo } from '@/lib/workflow-shared';

// 審査ワークフローの承認・却下・運営メモ更新API（管理 審査ワークフロー仕様書 §3・§4・§6）。
// ここでは、ワークフローの読み込み・運営メモの保存・審査中かどうかの確認だけを行い、承認・却下は種別ごとの処理
// （lib/workflow-decisions.ts の表から、lib/review-report-server.ts・lib/playlist-proposal-server.ts・lib/game-proposal-server.ts・
// lib/channel-application-server.ts・lib/change-proposal-server.ts）へ渡す。
// operator/owner共通のためロール別の分岐は無い（requireAdminのみで判定）。
// 依頼: { action: 'update_memo', operatorMemo } / { action: 'approve' | 'reject', comment?, ...種別ごとの項目 }
// 応答: { ok: true, ...種別ごとの項目 } / { error, message? }（エラーコードは種別ごとの処理が決める）
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ workflowId: string }> }) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { uid } = auth;

  const { workflowId } = await params;
  const workflowRef = adminDb.collection('workflows').doc(workflowId);
  const workflowSnap = await workflowRef.get();
  if (!workflowSnap.exists) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const workflow = workflowSnap.data()!;
  const decide = workflowDecisionHandler(workflow.type);
  if (!decide) {
    return NextResponse.json({ error: 'unsupported_type' }, { status: 400 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const action = body.action;

  if (action === 'update_memo') {
    const operatorMemo = normalizeOperatorMemo(body.operatorMemo);
    if (operatorMemo === undefined) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    await workflowRef.update({ operatorMemo, updatedAt: new Date() });
    return NextResponse.json({ ok: true });
  }

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }
  if (!isPendingStatus(workflow.status)) {
    return NextResponse.json({ error: 'already_processed' }, { status: 409 });
  }

  const result = await decide({ workflowRef, workflowId, workflow, action, uid, comment: normalizeDecisionComment(body.comment), body });
  if ('error' in result) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, ...result.response });
}
