// 詳細ページからの変更の提案（サーバー専用）。ページ 詳細ページからの変更提案 仕様書、管理 審査ワークフロー仕様書 §16。
// - 送信（submitChangeProposal）: 回数・重複・対象の状態をここで確かめ、1人の提案を workflows の1件にする
// - 審査（decideChangeProposal）: 同じ対象（reportData.targetKey）の審査中の提案をまとめて承認・却下し、報告した全員に通知する
// workflows の読み取りは等価条件だけ（submittedBy、reportData.targetKey）で行い、種別・状態・日付はメモリで絞る（複合インデックスを増やさない）。
import { FieldValue, type DocumentData, type DocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { newWorkflowRecord } from './playlist-registration';
import { getProposalChannelState } from './channel-application-server';
import { unlistPlaylist, turnChannelOff } from './listing-server';
import { changePlaylistGame } from './playlist-game-linking';
import { MAX_GAME_TITLE_LENGTH } from './proposal-shared';
import {
  CHANGE_APPROVE_ACTIONS,
  CHANGE_PROPOSAL_DAILY_LIMIT,
  CHANGE_PROPOSAL_TYPE,
  CHANGE_PROPOSAL_TYPES,
  CHANNEL_CHANGE_REASONS,
  GAME_CHANGE_FIELDS,
  MAX_CHANGE_DETAIL_LENGTH,
  PLAYLIST_CHANGE_REASONS,
  changeRejectReasonLabel,
  changeResultMessage,
  changeTargetKey,
  type ChangeApproveAction,
  type ChangeTargetType,
} from './change-proposal-shared';

const PENDING = new Set(['reviewing_lv1', 'reviewing_lv2']);
const APPROVING_LOCK_MS = 2 * 60 * 1000;

export type ChangeApiError = { error: string; status: number };

function validId(id: unknown): id is string {
  return typeof id === 'string' && /^[\w-]{1,128}$/.test(id) && !/^__.*__$/.test(id);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** この人の審査中の提案のうち、対象が同じもの（重複の判定・詳細ページのモーダル用） */
export async function findMyPendingChange(uid: string, targetKey: string): Promise<DocumentSnapshot | null> {
  const snap = await adminDb.collection('workflows').where('reportData.targetKey', '==', targetKey).get();
  return snap.docs.find((d) => d.data().submittedBy === uid && PENDING.has(d.data().status as string)) ?? null;
}

interface TargetSnapshot {
  name: string;
  thumbnailUrl: string;
}

/** 対象が提案を受け付ける状態か確かめ、提案時点の名前とサムネを返す（仕様書 §7.2） */
async function loadTarget(targetType: ChangeTargetType, targetId: string): Promise<(TargetSnapshot & { data: DocumentData }) | ChangeApiError> {
  if (targetType === 'game') {
    const snap = await adminDb.collection('games').doc(targetId).get();
    if (!snap.exists) return { error: 'target_not_found', status: 404 };
    const d = snap.data()!;
    return { name: (d.title as string) ?? '', thumbnailUrl: (d.packageImageUrl as string) ?? '', data: d };
  }
  if (targetType === 'channel') {
    const snap = await adminDb.collection('channels').doc(targetId).get();
    if (!snap.exists) return { error: 'target_not_found', status: 404 };
    if ((await getProposalChannelState(targetId)) !== 'listed') return { error: 'target_unavailable', status: 409 };
    const d = snap.data()!;
    return { name: (d.name as string) ?? '', thumbnailUrl: (d.iconUrl as string) ?? '', data: d };
  }
  const snap = await adminDb.collection('playlists').doc(targetId).get();
  if (!snap.exists) return { error: 'target_not_found', status: 404 };
  const d = snap.data()!;
  if (d.isPublic !== true || d.listingStatus !== 'listed') return { error: 'target_unavailable', status: 409 };
  return { name: (d.title as string) ?? '', thumbnailUrl: (d.thumbnailUrl as string) ?? '', data: d };
}

/** 提案を受け付ける（POST /api/change-proposals） */
export async function submitChangeProposal(uid: string, body: Record<string, unknown>): Promise<{ ok: true; id: string } | ChangeApiError> {
  const targetType = body.targetType as ChangeTargetType;
  if (targetType !== 'game' && targetType !== 'channel' && targetType !== 'playlist') return { error: 'invalid_request', status: 400 };
  const targetId = body.targetId;
  if (!validId(targetId)) return { error: 'invalid_request', status: 400 };
  const detail = str(body.detail);
  if (detail.length > MAX_CHANGE_DETAIL_LENGTH) return { error: 'detail_too_long', status: 400 };

  const reportData: Record<string, unknown> = {
    targetType,
    targetId,
    targetKey: changeTargetKey(targetType, targetId),
    reason: null,
    fields: null,
    detail: detail || null,
    duplicateGameId: null,
    duplicateGameName: null,
    proposedGameId: null,
    proposedGameName: null,
    proposedGameTitle: null,
  };

  // 入力の形を先に確かめる（対象の読み取りより前）
  if (targetType === 'game') {
    const allowed = new Set<string>(GAME_CHANGE_FIELDS.map((f) => f.value));
    const fields = Array.isArray(body.fields) ? [...new Set(body.fields.filter((f): f is string => typeof f === 'string' && allowed.has(f)))] : [];
    if (fields.length === 0) return { error: 'reason_required', status: 400 };
    if (!detail) return { error: 'detail_required', status: 400 };
    reportData.fields = fields;
    if (fields.includes('duplicate') && body.duplicateGameId != null) {
      if (!validId(body.duplicateGameId) || body.duplicateGameId === targetId) return { error: 'invalid_request', status: 400 };
      reportData.duplicateGameId = body.duplicateGameId;
    }
  } else {
    const list = targetType === 'channel' ? CHANNEL_CHANGE_REASONS : PLAYLIST_CHANGE_REASONS;
    const reason = list.find((r) => r.value === body.reason);
    if (!reason) return { error: 'reason_required', status: 400 };
    if (reason.detailRequired && !detail) return { error: 'detail_required', status: 400 };
    reportData.reason = reason.value;
    if (reason.value === 'wrong_game') {
      const proposedGameId = body.proposedGameId;
      const proposedGameTitle = str(body.proposedGameTitle);
      if (validId(proposedGameId)) reportData.proposedGameId = proposedGameId;
      else if (proposedGameTitle) {
        if (proposedGameTitle.length > MAX_GAME_TITLE_LENGTH) return { error: 'game_title_too_long', status: 400 };
        reportData.proposedGameTitle = proposedGameTitle;
      } else return { error: 'game_required', status: 400 };
    }
  }

  const target = await loadTarget(targetType, targetId);
  if ('error' in target) return target;
  reportData.targetName = target.name;
  reportData.targetThumbnailUrl = target.thumbnailUrl;

  if (reportData.reason === 'wrong_game') {
    // ゲーム未設定の再生リストは「ゲームを登録」・ゲームの提案を使う（仕様書 §6.2）
    if (!target.data.gameId) return { error: 'game_unset', status: 409 };
    reportData.currentGameId = target.data.gameId;
    reportData.currentGameName = (target.data.gameName as string) ?? '';
    if (reportData.proposedGameId) {
      if (reportData.proposedGameId === target.data.gameId) return { error: 'same_game', status: 400 };
      const game = await adminDb.collection('games').doc(reportData.proposedGameId as string).get();
      if (!game.exists) return { error: 'game_not_found', status: 404 };
      reportData.proposedGameName = (game.data()!.title as string) ?? '';
    }
  }
  if (reportData.duplicateGameId) {
    const game = await adminDb.collection('games').doc(reportData.duplicateGameId as string).get();
    if (!game.exists) return { error: 'game_not_found', status: 404 };
    reportData.duplicateGameName = (game.data()!.title as string) ?? '';
  }

  // 同じ人の重複と1日の上限（直近24時間、3種類の合計）
  const mine = await adminDb.collection('workflows').where('submittedBy', '==', uid).get();
  const mineChanges = mine.docs.filter((d) => CHANGE_PROPOSAL_TYPES.includes(d.data().type as string));
  if (mineChanges.some((d) => d.data().reportData?.targetKey === reportData.targetKey && PENDING.has(d.data().status as string))) {
    return { error: 'already_proposed', status: 409 };
  }
  const since = Date.now() - 24 * 60 * 60 * 1000;
  if (mineChanges.filter((d) => (d.data().submittedAt?.toMillis?.() ?? 0) >= since).length >= CHANGE_PROPOSAL_DAILY_LIMIT) {
    return { error: 'daily_limit', status: 429 };
  }

  const ref = adminDb.collection('workflows').doc();
  await ref.set({ ...newWorkflowRecord(CHANGE_PROPOSAL_TYPE[targetType], uid, {}), proposalData: null, reportData });
  return { ok: true, id: ref.id };
}

/** 同じ対象の審査中の提案（自分を含む）。古い順 */
async function pendingGroup(targetKey: string): Promise<DocumentSnapshot[]> {
  const snap = await adminDb.collection('workflows').where('reportData.targetKey', '==', targetKey).get();
  return snap.docs
    .filter((d) => PENDING.has(d.data().status as string) && CHANGE_PROPOSAL_TYPES.includes(d.data().type as string))
    .sort((a, b) => (a.data()!.submittedAt?.toMillis?.() ?? 0) - (b.data()!.submittedAt?.toMillis?.() ?? 0));
}

/** 承認の処理を実行する（仕様書 §5.4・§6.3）。失敗したらエラーを返し、審査中のまま残す */
async function runApproveAction(
  targetType: ChangeTargetType,
  targetId: string,
  action: ChangeApproveAction,
  gameId: string | null,
  uid: string,
): Promise<{ ok: true } | ChangeApiError> {
  if (action === 'none') return { ok: true };
  if (action === 'non_game' || action === 'excluded') {
    const result = await unlistPlaylist(targetId, action, { setBy: 'admin', reason: 'report' });
    if (!result.ok) return { error: result.error === 'channel_off' ? 'playlist_channel_off' : 'playlist_not_found', status: 409 };
    return { ok: true };
  }
  if (action === 'relink') {
    if (!gameId) return { error: 'game_required', status: 400 };
    const result = await changePlaylistGame(targetId, gameId, uid);
    if (result === 'playlist_not_found' || result === 'game_not_found') return { error: result, status: 404 };
    return { ok: true };
  }
  // channel_excluded: 掲載チャンネル画面の「掲載から外す」と同じ（app/api/admin/collection/channels の exclude）
  const snap = await adminDb.collection('exploration_channels').where('youtubeChannelId', '==', targetId).get();
  const active = snap.docs.find((d) => d.data().status === 'active');
  if (!active) {
    // すでに外れている・止めている（掲載停止は本人の申し出なので上書きしない）なら、処理済みとして承認する
    if (snap.docs.some((d) => d.data().status === 'excluded' || d.data().status === 'opted_out')) return { ok: true };
    return { error: 'channel_not_listed', status: 409 };
  }
  await turnChannelOff(active.id, targetId, 'channel_excluded');
  await active.ref.update({ status: 'excluded', statusNote: '詳細ページからの変更の提案で掲載から外した', updatedAt: new Date() });
  return { ok: true };
}

/**
 * 同じ対象の審査中の提案をまとめて承認・却下する（管理 審査ワークフロー仕様書 §16）。
 * 承認は選んだ処理（approveAction）を実行してから、まとめた全件を承認済みにし、報告した全員に通知する。
 */
export async function decideChangeProposal(params: {
  workflowId: string;
  workflow: DocumentData;
  action: 'approve' | 'reject';
  uid: string;
  comment: string | null;
  rejectReasonCode: unknown;
  approveAction: unknown;
  gameId: unknown;
}): Promise<{ ok: true; count: number } | ChangeApiError> {
  const { workflowId, workflow, action, uid, comment } = params;
  const report = (workflow.reportData ?? {}) as Record<string, unknown>;
  const targetType = report.targetType as ChangeTargetType;
  const targetId = report.targetId as string;
  const targetKey = report.targetKey as string;
  if (!CHANGE_APPROVE_ACTIONS[targetType] || !targetId || !targetKey) return { error: 'invalid_workflow', status: 400 };

  const rejectLabel = changeRejectReasonLabel(params.rejectReasonCode);
  if (action === 'reject' && !rejectLabel) return { error: 'reject_reason_required', status: 400 };
  const approveAction = (action === 'approve' ? params.approveAction : 'none') as ChangeApproveAction;
  if (!CHANGE_APPROVE_ACTIONS[targetType].includes(approveAction)) return { error: 'invalid_action', status: 400 };
  const gameId = approveAction === 'relink' ? (validId(params.gameId) ? params.gameId : null) : null;
  if (approveAction === 'relink' && !gameId) return { error: 'game_required', status: 400 };

  const now = new Date();
  const primaryRef = adminDb.collection('workflows').doc(workflowId);
  // 同時に承認・却下しないよう、この画面の提案（primary）に処理中の印を先に取る
  const claimed = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(primaryRef);
    const current = snap.data();
    if (!current || !PENDING.has(current.status as string)) return false;
    const approvingAt = current.approvingAt?.toMillis?.() ?? 0;
    if (approvingAt && now.getTime() - approvingAt < APPROVING_LOCK_MS) return false;
    tx.update(primaryRef, { approvingAt: now });
    return true;
  });
  if (!claimed) return { error: 'already_processed', status: 409 };

  try {
    if (action === 'approve') {
      const done = await runApproveAction(targetType, targetId, approveAction, gameId, uid);
      if ('error' in done) {
        await primaryRef.update({ approvingAt: FieldValue.delete() });
        return done;
      }
    }

    const gameName = gameId ? (((await adminDb.collection('games').doc(gameId).get()).data()?.title as string) ?? '') : null;
    const group = await pendingGroup(targetKey);
    const ids = new Set([workflowId, ...group.map((d) => d.id)]);
    const refs = [...ids].map((id) => adminDb.collection('workflows').doc(id));
    const historyEntry = {
      executedAt: now,
      operatorId: uid,
      isAI: false,
      action: action === 'approve' ? 'approved' : 'rejected',
      comment,
      approveAction: action === 'approve' ? approveAction : null,
      gameId,
      gameName,
    };

    const count = await adminDb.runTransaction(async (tx) => {
      const snaps = await tx.getAll(...refs);
      let n = 0;
      for (const snap of snaps) {
        const current = snap.data();
        if (!current || !PENDING.has(current.status as string)) continue;
        const name = (current.reportData?.targetName as string) ?? (report.targetName as string) ?? '';
        tx.update(snap.ref, {
          status: action === 'approve' ? 'approved' : 'rejected',
          step2History: [...(current.step2History ?? []), historyEntry],
          'reportData.decisionId': workflowId,
          'reportData.rejectReasonCode': action === 'reject' ? params.rejectReasonCode : null,
          approvingAt: FieldValue.delete(),
          updatedAt: now,
        });
        if (current.submittedBy) {
          tx.set(adminDb.collection('notifications').doc(), {
            userId: current.submittedBy,
            type: 'review_result',
            workflowId: snap.id,
            playlistId: null,
            playlistTitle: '',
            message: changeResultMessage(targetType, name, action, rejectLabel),
            isRead: false,
            createdAt: now,
          });
        }
        n++;
      }
      return n;
    });
    return { ok: true, count };
  } catch (e) {
    await primaryRef.update({ approvingAt: FieldValue.delete() }).catch(() => undefined);
    throw e;
  }
}

/** 提案履歴（GET /api/playlists/proposals）に並べる「変更の提案」 */
export async function listMyChangeProposals(uid: string) {
  const snap = await adminDb.collection('workflows').where('submittedBy', '==', uid).get();
  return snap.docs
    .filter((d) => CHANGE_PROPOSAL_TYPES.includes(d.data().type as string))
    .map((d) => {
      const data = d.data();
      const r = (data.reportData ?? {}) as Record<string, unknown>;
      const status = data.status === 'approved' ? ('approved' as const) : data.status === 'rejected' ? ('rejected' as const) : ('reviewing' as const);
      const history = (data.step2History ?? []) as Array<{ executedAt?: { toMillis?: () => number }; approveAction?: string | null }>;
      const decided = status !== 'reviewing' ? history[history.length - 1] : undefined;
      // 掲載から外れた再生リスト・チャンネルはリンクしない
      const unlisted = status === 'approved' && ['non_game', 'excluded', 'channel_excluded'].includes(decided?.approveAction ?? '');
      return {
        kind: 'change_proposal' as const,
        id: d.id,
        status,
        targetType: r.targetType as ChangeTargetType,
        targetId: (r.targetId as string) ?? '',
        targetName: (r.targetName as string) ?? '',
        targetThumbnailUrl: (r.targetThumbnailUrl as string) ?? '',
        reason: (r.reason as string | null) ?? null,
        fields: (r.fields as string[] | null) ?? null,
        linkable: !unlisted,
        submittedAt: data.submittedAt?.toMillis?.() ?? 0,
        decidedAt: decided?.executedAt?.toMillis?.() ?? null,
        rejectReason: status === 'rejected' ? changeRejectReasonLabel(r.rejectReasonCode) : null,
      };
    });
}
