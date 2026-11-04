// チャンネル申請（段階6）と、再生リスト提案の「掲載チャンネルか」の分岐で使うサーバー側処理。
// ページ チャンネルを申請する 仕様書（§4・§5・§8）、管理 審査ワークフロー仕様書 §15.2・§15.4、
// ページ 再生リストを追加する 仕様書 §10.1。
// 掲載チャンネルの一覧（`exploration_channels`）の管理APIは収集の段階4の担当なので、ここでは状態を読むのと、
// 申請の承認で掲載チャンネルに加える（publishMode: confirm）ことだけを行う。
import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import {
  extractPlaylistId,
  fetchChannelDetails,
  fetchPlaylistSnippet,
  parseChannelRef,
  resolveChannelRef,
  YouTubeApiError,
  type ChannelDetail,
} from './youtube';
import {
  CHANNEL_APPLICATION_TYPE,
  channelApplicationRejectReasonLabel,
  DAILY_APPLICATION_LIMIT,
  type ApplyChannelState,
} from './channel-application-shared';
import { todayJst } from './collection-quota-shared';
import { exploreChannels } from './exploration-server';
import { checkCollectionQuota } from './collection-quota';

export type ChannelApiError = { error: string; status: number; message?: string };

const PENDING_STATUSES = new Set(['reviewing_lv1', 'reviewing_lv2']);

/**
 * 申請画面の入力（チャンネルURL・@ハンドル・UC…・再生リストURL）からチャンネルを特定する（仕様書 §4）。
 * 名前での検索はしない。再生リストURLはその再生リストの所属チャンネルとして扱う。
 */
export async function resolveApplyInput(input: string): Promise<ChannelDetail | ChannelApiError> {
  const text = input.trim();
  if (!text) return { error: 'invalid_input', status: 400 };
  try {
    const ref = parseChannelRef(text);
    if (ref) {
      const detail = await resolveChannelRef(ref);
      return detail ?? { error: 'channel_not_found', status: 404 };
    }
    const playlistId = /^https?:\/\//.test(text) ? extractPlaylistId(text) : null;
    if (playlistId) {
      const playlist = await fetchPlaylistSnippet(playlistId);
      if (!playlist) return { error: 'channel_not_found', status: 404 };
      const [detail] = await fetchChannelDetails([playlist.channelId]);
      return detail ?? { error: 'channel_not_found', status: 404 };
    }
  } catch (e) {
    return { error: 'youtube_api_error', status: 502, message: e instanceof YouTubeApiError ? e.message : undefined };
  }
  return { error: 'invalid_input', status: 400 };
}

/**
 * 掲載チャンネルとしての状態。同じ YouTube チャンネルのドキュメントが複数あるときは opted_out → active → それ以外の順に優先する
 * （掲載を止めたチャンネルを申請・提案で掲載し直さないため。コンテンツ収集機能仕様書 §10.6）。
 * ドキュメントが無ければ status は null。
 */
export async function getListingChannel(
  youtubeChannelId: string,
): Promise<{ status: string | null; doc: DocumentSnapshot | null; docs: DocumentSnapshot[] }> {
  const snap = await adminDb.collection('exploration_channels').where('youtubeChannelId', '==', youtubeChannelId).get();
  const docs = snap.docs;
  const pick = docs.find((d) => d.data().status === 'opted_out') ?? docs.find((d) => d.data().status === 'active') ?? docs[0] ?? null;
  return { status: (pick?.data()?.status as string | undefined) ?? null, doc: pick, docs };
}

/** 再生リスト提案ができる（掲載中の）チャンネルか。ページ 再生リストを追加する 仕様書 §10.1 */
export async function getProposalChannelState(youtubeChannelId: string): Promise<'listed' | 'not_listed' | 'opted_out'> {
  const { status } = await getListingChannel(youtubeChannelId);
  if (status === 'active') return 'listed';
  if (status === 'opted_out') return 'opted_out';
  return 'not_listed';
}

/** 同じチャンネルの審査中の申請（自分・他の人を問わない。2件目以降は受け付けない、2026-11-04 ユーザー決定） */
async function findPendingApplications(youtubeChannelId: string): Promise<DocumentSnapshot[]> {
  const snap = await adminDb
    .collection('workflows')
    .where('type', '==', CHANNEL_APPLICATION_TYPE)
    .where('proposalData.youtubeChannelId', '==', youtubeChannelId)
    .get();
  return snap.docs.filter((d) => PENDING_STATUSES.has(d.data().status as string));
}

/** 今日（日本時間）この人が送った申請の数。見送られた申請も数える（仕様書 §8） */
export async function countTodayApplications(uid: string): Promise<number> {
  const snap = await adminDb.collection('workflows').where('submittedBy', '==', uid).where('type', '==', CHANNEL_APPLICATION_TYPE).get();
  const today = todayJst();
  return snap.docs.filter((d) => {
    const at = d.data().submittedAt?.toDate?.() as Date | undefined;
    return !!at && todayJst(at) === today;
  }).length;
}

export interface ApplyCheck {
  state: ApplyChannelState;
  /** 審査中の申請が自分のものか（提案履歴へのリンクを出す） */
  pendingIsMine: boolean;
  /** 掲載中のとき、チャンネル詳細ページがあればそのID（`channels` のドキュメントID） */
  channelPageId: string | null;
}

/** 申請を受け付けるか（仕様書 §4「受け付けないチャンネル」） */
export async function checkApplyChannel(youtubeChannelId: string, uid: string): Promise<ApplyCheck> {
  const [{ status }, pending] = await Promise.all([getListingChannel(youtubeChannelId), findPendingApplications(youtubeChannelId)]);
  if (status === 'opted_out') return { state: 'opted_out', pendingIsMine: false, channelPageId: null };
  if (status === 'active') {
    const channelDoc = await adminDb.collection('channels').doc(youtubeChannelId).get();
    return { state: 'listed', pendingIsMine: false, channelPageId: channelDoc.exists ? youtubeChannelId : null };
  }
  if (pending.length > 0) {
    return { state: 'pending', pendingIsMine: pending.some((d) => d.data()!.submittedBy === uid), channelPageId: null };
  }
  return { state: 'ok', pendingIsMine: false, channelPageId: null };
}

// ---- 審査（管理 審査ワークフロー仕様書 §15.2） ----

// 承認処理中の印（approvingAt）の有効期間。再生リスト登録提案の承認と同じ
const APPROVING_LOCK_MS = 2 * 60 * 1000;

/**
 * チャンネル申請の承認・却下。承認では掲載チャンネル（exploration_channels）に active で加え、
 * そのチャンネルの再生リストを1回取り込む（取り込みの失敗は承認を取り消さない）。
 * 承認・却下とも申請者にサイト内通知（review_result）を作る。
 */
export async function decideChannelApplication(params: {
  workflowRef: DocumentReference;
  workflow: FirebaseFirestore.DocumentData;
  workflowId: string;
  action: 'approve' | 'reject';
  uid: string;
  comment: string | null;
  rejectReasonCode: unknown;
}): Promise<{ ok: true; imported: boolean } | ChannelApiError> {
  const { workflowRef, workflow, workflowId, action, uid, comment } = params;
  const proposal = (workflow.proposalData ?? {}) as Record<string, unknown>;
  const youtubeChannelId = typeof proposal.youtubeChannelId === 'string' ? proposal.youtubeChannelId : '';
  const channelTitle = (proposal.channelTitle as string) ?? '';
  const now = new Date();

  const rejectReasonLabel = channelApplicationRejectReasonLabel(params.rejectReasonCode);
  if (action === 'reject' && !rejectReasonLabel) return { error: 'reject_reason_required', status: 400 };
  if (!youtubeChannelId) return { error: 'invalid_workflow', status: 400 };

  const updates: Record<string, unknown> = {};
  let imported = false;
  let newlyActivatedId: string | null = null;

  if (action === 'approve') {
    // 同時承認で二重に掲載チャンネルを作らないよう、承認処理中の印を先に取る
    const claimed = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(workflowRef);
      const current = snap.data();
      if (!current || !PENDING_STATUSES.has(current.status as string)) return false;
      const approvingAt = current.approvingAt?.toMillis?.() ?? 0;
      if (approvingAt && now.getTime() - approvingAt < APPROVING_LOCK_MS) return false;
      tx.update(workflowRef, { approvingAt: now });
      return true;
    });
    if (!claimed) return { error: 'already_processed', status: 409 };

    try {
      const { status, doc, docs } = await getListingChannel(youtubeChannelId);
      if (status === 'opted_out') {
        await workflowRef.update({ approvingAt: FieldValue.delete() });
        return { error: 'channel_opted_out', status: 409 };
      }
      if (status === 'active' && doc) {
        updates['proposalData.explorationChannelId'] = doc.id;
      } else {
        // チャンネルの情報は承認時点の YouTube から取り直す（取れなければ申請時点の情報）
        let detail: ChannelDetail | null = null;
        try {
          [detail] = await fetchChannelDetails([youtubeChannelId]);
        } catch {
          detail = null;
        }
        const authorizedVia = proposal.applicantType === 'creator' ? 'creator_application' : 'viewer_recommendation';
        const fields = {
          status: 'active',
          youtubeChannelId,
          channelTitle: detail?.title ?? channelTitle,
          channelIconUrl: detail?.iconUrl ?? ((proposal.channelIconUrl as string) ?? ''),
          subscriberCount: detail ? detail.subscriberCount : ((proposal.subscriberCount as number | null) ?? null),
          searchCandidates: [],
          // 申請で入ったチャンネルは「確認してから掲載」（コンテンツ収集機能仕様書 §10.3）
          publishMode: 'confirm',
          authorizedVia,
          applicationWorkflowId: workflowId,
          updatedAt: now,
        };
        // 同じ YouTube チャンネルの既存ドキュメント（未特定・確認待ち・掲載しない）があればそれを使う
        const existing = doc ?? docs[0] ?? null;
        if (existing) {
          await existing.ref.update(fields);
          newlyActivatedId = existing.id;
        } else {
          const ref = await adminDb.collection('exploration_channels').add({
            name: fields.channelTitle,
            ...fields,
            tagIds: [],
            lastExploredAt: null,
            lastFoundCount: null,
            createdAt: now,
            createdBy: uid,
          });
          newlyActivatedId = ref.id;
        }
        updates['proposalData.explorationChannelId'] = newlyActivatedId;
      }
    } catch (e) {
      await workflowRef.update({ approvingAt: FieldValue.delete() }).catch(() => undefined);
      throw e;
    }
    updates.approvingAt = FieldValue.delete();
  } else {
    updates['proposalData.rejectReasonCode'] = params.rejectReasonCode;
  }

  const notification = workflow.submittedBy
    ? {
        userId: workflow.submittedBy,
        type: 'review_result',
        workflowId,
        playlistId: null,
        playlistTitle: '',
        message:
          action === 'approve'
            ? `チャンネル「${channelTitle}」の申請が承認されました。再生リストは運営の確認のあと順に公開します`
            : `チャンネル「${channelTitle}」の申請は見送りになりました（${rejectReasonLabel}）`,
        isRead: false,
        createdAt: now,
      }
    : null;

  const historyEntry = { executedAt: now, operatorId: uid, isAI: false, action: action === 'approve' ? 'approved' : 'rejected', comment };
  const committed = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(workflowRef);
    const current = snap.data();
    if (!current || !PENDING_STATUSES.has(current.status as string)) return false;
    const approvingAt = current.approvingAt?.toMillis?.() ?? 0;
    if (action === 'reject' && approvingAt && now.getTime() - approvingAt < APPROVING_LOCK_MS) return false;
    tx.update(workflowRef, {
      ...updates,
      status: action === 'approve' ? 'approved' : 'rejected',
      step2History: [...(current.step2History ?? []), historyEntry],
      updatedAt: now,
    });
    if (notification) tx.set(adminDb.collection('notifications').doc(), notification);
    return true;
  });
  if (!committed) return { error: 'already_processed', status: 409 };

  // 掲載チャンネルに加えたら、その場で再生リストを1回取り込む（§15.2）。失敗しても承認は取り消さない（次の巡回で拾う）
  if (newlyActivatedId) {
    try {
      const quota = await checkCollectionQuota(1);
      if (quota.ok) {
        await exploreChannels({ trigger: 'manual', executedBy: uid, explorationChannelId: newlyActivatedId });
        imported = true;
      }
    } catch (e) {
      console.error('チャンネル申請の承認後の取り込みに失敗', e);
    }
  }
  return { ok: true, imported };
}
