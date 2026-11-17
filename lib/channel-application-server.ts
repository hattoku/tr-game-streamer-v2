// チャンネル申請（段階6）と、再生リスト提案の「掲載チャンネルか」の分岐で使うサーバー側処理。
// ページ チャンネルを申請する 仕様書（§4・§5・§8）、管理 審査ワークフロー仕様書 §4.4、
// ページ 再生リストを追加する 仕様書 §10.1。
// 掲載チャンネルの一覧（`exploration_channels`）の管理APIは収集の段階4の担当なので、ここでは状態を読むのと、
// 申請の承認で掲載チャンネルに加える（publishMode: confirm）ことだけを行う。
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import {
  extractPlaylistId,
  extractVideoId,
  fetchVideoChannelId,
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
  channelApplicationResultMessage,
  type ApplyChannelState,
} from './channel-application-shared';
import { todayJst } from './collection-quota-shared';
import { sweepChannelAfterResponse } from './channel-sweep-run';
import { decisionHistoryEntry, isPendingStatus, reviewResultNotification } from './workflow-shared';
import { ALREADY_PROCESSED, claimApproving, commitDecision, releaseApproving, type WorkflowDecisionHandler } from './workflow-server';

export type ChannelApiError = { error: string; status: number; message?: string };

/**
 * 申請画面の入力（チャンネルURL・@ハンドル・UC…・再生リストURL・動画URL）からチャンネルを特定する（仕様書 §4、ページ 提案する 仕様書 §6.1）。
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
    // 動画のURL（list= の無いもの）は、その動画の投稿チャンネルとして扱う（ページ 提案する 仕様書 §6.1）
    const videoId = extractVideoId(text);
    if (videoId) {
      const channelId = await fetchVideoChannelId(videoId);
      if (!channelId) return { error: 'channel_not_found', status: 404 };
      const [detail] = await fetchChannelDetails([channelId]);
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
  return snap.docs.filter((d) => isPendingStatus(d.data().status));
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

// ---- 審査（管理 審査ワークフロー仕様書 §4.4） ----

/**
 * YouTube チャンネルを掲載チャンネル（`exploration_channels`、status: active、掲載方法「確認してから掲載」）にする。
 * チャンネル申請の承認（審査ワークフロー仕様書 §4.4）と、管理者の直接登録でチャンネルも同時に掲載するとき
 * （ページ 提案する 仕様書 §9）に使う。同じ YouTube チャンネルの既存ドキュメント（未特定・確認待ち・掲載しない）があればそれを使う。
 * 戻り値は掲載チャンネルのドキュメントID。取り込み（lib/channel-sweep-run.ts の sweepChannelAfterResponse）は呼び出し側で行う。
 */
export async function activateListingChannel(params: {
  youtubeChannelId: string;
  authorizedVia: 'channel_application' | 'admin';
  uid: string;
  applicationWorkflowId: string | null;
  existing: DocumentSnapshot | null;
  fallback: { title: string; iconUrl: string; subscriberCount: number | null };
}): Promise<string> {
  const { youtubeChannelId, authorizedVia, uid, applicationWorkflowId, existing, fallback } = params;
  const now = new Date();
  // チャンネルの情報はこの時点の YouTube から取り直す（取れなければ呼び出し側から渡された情報）
  let detail: ChannelDetail | null = null;
  try {
    [detail] = await fetchChannelDetails([youtubeChannelId]);
  } catch {
    detail = null;
  }
  const fields = {
    status: 'active',
    youtubeChannelId,
    channelTitle: detail?.title ?? fallback.title,
    channelIconUrl: detail?.iconUrl ?? fallback.iconUrl,
    subscriberCount: detail ? detail.subscriberCount : fallback.subscriberCount,
    searchCandidates: [],
    // 申請・管理者の同時掲載で入ったチャンネルは「確認してから掲載」（コンテンツ収集機能仕様書 §10.3）
    publishMode: 'confirm',
    authorizedVia,
    applicationWorkflowId,
    updatedAt: now,
  };
  if (existing) {
    await existing.ref.update(fields);
    return existing.id;
  }
  // ドキュメントIDを YouTube のチャンネルIDにして、同じチャンネルを同時に掲載しても二重に作らない
  // （作成済みなら create が失敗するので、その場合は作った側のドキュメントを active にするだけ）
  const ref = adminDb.collection('exploration_channels').doc(youtubeChannelId);
  const created = {
    name: fields.channelTitle,
    ...fields,
    tagIds: [],
    lastExploredAt: null,
    lastFoundCount: null,
    createdAt: now,
    createdBy: uid,
  };
  try {
    await ref.create(created);
  } catch {
    await ref.update(fields);
  }
  return ref.id;
}

/**
 * チャンネル申請の承認・却下（lib/workflow-decisions.ts から呼ぶ）。承認では掲載チャンネル（exploration_channels）に active で加え、
 * そのチャンネルの再生リストを1回取り込む（取り込みの失敗は承認を取り消さない）。却下は定型の見送り理由が必須。
 * 承認・却下とも申請者にサイト内通知（review_result）を作る。応答の `imported` は取り込みを予約したか（応答のあとに実行。結果は見ない）
 */
export const decideChannelApplication: WorkflowDecisionHandler = async ({ workflowRef, workflowId, workflow, action, uid, comment, body }) => {
  const proposal = (workflow.proposalData ?? {}) as Record<string, unknown>;
  const youtubeChannelId = typeof proposal.youtubeChannelId === 'string' ? proposal.youtubeChannelId : '';
  const channelTitle = (proposal.channelTitle as string) ?? '';
  const now = new Date();

  const rejectReasonLabel = channelApplicationRejectReasonLabel(body.rejectReasonCode);
  if (action === 'reject' && !rejectReasonLabel) return { error: 'reject_reason_required', status: 400 };
  if (!youtubeChannelId) return { error: 'invalid_workflow', status: 400 };

  const updates: Record<string, unknown> = {};
  let newlyActivatedId: string | null = null;

  if (action === 'approve') {
    // 同時承認で二重に掲載チャンネルを作らないよう、承認処理中の印を先に取る
    if (!(await claimApproving(workflowRef, now))) return ALREADY_PROCESSED;
    try {
      const { status, doc, docs } = await getListingChannel(youtubeChannelId);
      if (status === 'opted_out') {
        await releaseApproving(workflowRef);
        return { error: 'channel_opted_out', status: 409 };
      }
      if (status === 'active' && doc) {
        updates['proposalData.explorationChannelId'] = doc.id;
      } else {
        newlyActivatedId = await activateListingChannel({
          youtubeChannelId,
          authorizedVia: 'channel_application',
          uid,
          applicationWorkflowId: workflowId,
          existing: doc ?? docs[0] ?? null,
          fallback: {
            title: channelTitle,
            iconUrl: (proposal.channelIconUrl as string) ?? '',
            subscriberCount: (proposal.subscriberCount as number | null) ?? null,
          },
        });
        updates['proposalData.explorationChannelId'] = newlyActivatedId;
      }
    } catch (e) {
      await releaseApproving(workflowRef).catch(() => undefined);
      throw e;
    }
    updates.approvingAt = FieldValue.delete();
  } else {
    updates['proposalData.rejectReasonCode'] = body.rejectReasonCode;
  }

  const notification = workflow.submittedBy
    ? reviewResultNotification({
        userId: workflow.submittedBy as string,
        workflowId,
        now,
        message: channelApplicationResultMessage(channelTitle, action, rejectReasonLabel),
      })
    : null;

  const committed = await commitDecision({
    ref: workflowRef,
    action,
    now,
    updates,
    historyEntry: decisionHistoryEntry({ now, uid, action, comment }),
    notification,
  });
  if (!committed) return ALREADY_PROCESSED;

  // 掲載チャンネルに加えたら、再生リストを1回取り込む。再生リストの多いチャンネルでも承認の応答が
  // タイムアウトしないよう、応答のあとに実行する。失敗しても承認は取り消さない（次の巡回で拾う）
  if (newlyActivatedId) sweepChannelAfterResponse(newlyActivatedId, uid, 'チャンネル申請の承認後の取り込み');
  return { ok: true, response: { imported: !!newlyActivatedId } };
};
