// 審査ワークフローの画面（/admin/workflows、components/admin/workflows/）の読み込みと審査 API の呼び出し（クライアント専用）。
// 管理 審査ワークフロー仕様書 §5。workflows は rules で管理者だけが読めるため、読み込みはクライアントSDK、
// 承認・却下・運営メモは PATCH /api/admin/workflows/[workflowId]（lib/admin-api.ts）。管理画面の読み込みの決まりは lib/admin-api.ts の冒頭。
import { collection, doc, getDoc, getDocs, limit, onSnapshot, query, where, type DocumentData, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import { callAdminApi, requestAdminApi } from './admin-api';
import { CHANGE_PROPOSAL_TYPES, groupChangeProposals, type ChangeProposalItem } from './change-proposal-shared';
import { CHANNEL_APPLICATION_TYPE } from './channel-application-shared';
import { GAME_PROPOSAL_TYPE, PROPOSAL_TYPE_LABEL, PROPOSAL_TYPES } from './proposal-shared';
import { REVIEW_REPORT_TYPE, reportReasonLabel } from './report-reasons';
import { countPendingWorkflows, isPendingStatus, type WorkflowStatus } from './workflow-shared';

/** workflows の1件（画面の部品に渡す。firebase/firestore を部品から直接 import しないための別名） */
export type WorkflowDoc = DocumentData;

function toMillis(value: unknown): number {
  return (value as { toMillis?: () => number } | null | undefined)?.toMillis?.() ?? 0;
}

function statusOf(data: DocumentData): WorkflowStatus {
  return (data.status as WorkflowStatus) ?? 'reviewing_lv1';
}

// ---- 一覧（§5.1） ----

/** 一覧の1行 */
export interface WorkflowRow {
  id: string;
  /** 一覧の1行に出す説明 */
  summary: string;
  status: WorkflowStatus;
  submittedAt: number;
}

const DELETED_PLAYLIST = '(削除済みの再生リスト)';

/**
 * 「通報」セクションの行（新しい順）。レビューコメント通報と、詳細ページからの変更の提案（対象ごとに1行）。
 * workflows は type の等価条件（変更の提案は in）だけで読み、状態・並び順はメモリで扱う（複合インデックスを増やさない）
 */
export async function fetchReportRows(): Promise<WorkflowRow[]> {
  const [reportSnap, changeSnap] = await Promise.all([
    getDocs(query(collection(db, 'workflows'), where('type', '==', REVIEW_REPORT_TYPE))),
    getDocs(query(collection(db, 'workflows'), where('type', 'in', CHANGE_PROPOSAL_TYPES))),
  ]);
  const playlistIds = [...new Set(reportSnap.docs.map((d) => d.data().reportData?.playlistId as string).filter(Boolean))];
  const titles = new Map(await Promise.all(playlistIds.map(async (id) => [id, (await fetchPlaylistTitle(id)) ?? DELETED_PLAYLIST] as const)));
  const reports = reportSnap.docs.map((d): WorkflowRow => {
    const data = d.data();
    const title = titles.get((data.reportData?.playlistId as string) ?? '') ?? DELETED_PLAYLIST;
    return {
      id: d.id,
      summary: `${reportReasonLabel((data.reportData?.reason as string) ?? null)} — 「${title}」のレビュー`,
      status: statusOf(data),
      submittedAt: toMillis(data.submittedAt),
    };
  });
  const changes = groupChangeProposals(changeSnap.docs.map(toChangeProposalItem), isPendingStatus).map(
    (g): WorkflowRow => ({ id: g.id, summary: g.summary, status: g.status as WorkflowStatus, submittedAt: g.submittedAt }),
  );
  return byNewest([...reports, ...changes]);
}

/** 「提案」セクションの行（新しい順）。再生リスト登録提案・ゲームタイトル登録提案・チャンネル申請 */
export async function fetchProposalRows(): Promise<WorkflowRow[]> {
  const snap = await getDocs(query(collection(db, 'workflows'), where('type', 'in', [...PROPOSAL_TYPES])));
  return byNewest(
    snap.docs.map((d): WorkflowRow => {
      const data = d.data();
      const type = data.type as string;
      const name =
        type === GAME_PROPOSAL_TYPE
          ? (data.proposalData?.gameTitle as string)
          : type === CHANNEL_APPLICATION_TYPE
            ? (data.proposalData?.channelTitle as string)
            : (data.proposalData?.title as string);
      return { id: d.id, summary: `${PROPOSAL_TYPE_LABEL[type] ?? type} — 「${name ?? ''}」`, status: statusOf(data), submittedAt: toMillis(data.submittedAt) };
    }),
  );
}

function byNewest(rows: WorkflowRow[]): WorkflowRow[] {
  return rows.sort((a, b) => b.submittedAt - a.submittedAt);
}

/**
 * 未処理（審査中）の件数（§5.3。ダッシュボードのカードとナビのバッジ）。一覧の行の数と同じ数え方。
 * 二段階の審査は使っていないため reviewing_lv1 だけを読む（単一フィールドの等価条件）
 */
export async function fetchPendingWorkflowCounts(): Promise<{ reports: number; proposals: number; total: number }> {
  const snap = await getDocs(query(collection(db, 'workflows'), where('status', '==', 'reviewing_lv1')));
  return countPendingWorkflows(snap.docs.map((d) => ({ id: d.id, type: d.data().type, status: d.data().status, reportData: d.data().reportData })));
}

// ---- 詳細（§5.2） ----

/** ワークフロー1件を購読する（無ければ null） */
export function subscribeWorkflow(workflowId: string, onChange: (data: DocumentData | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'workflows', workflowId), (snap) => onChange(snap.exists() ? snap.data() : null));
}

function toChangeProposalItem(d: { id: string; data(): DocumentData }): ChangeProposalItem {
  const data = d.data();
  return {
    id: d.id,
    status: (data.status as string) ?? 'reviewing_lv1',
    submittedBy: (data.submittedBy as string) ?? '',
    submittedAt: toMillis(data.submittedAt),
    reportData: (data.reportData as Record<string, unknown> | undefined) ?? {},
  };
}

/** 同じ対象（`reportData.targetKey`）の変更の提案をすべて購読する（まとめ方は画面側で決める） */
export function subscribeChangeProposals(targetKey: string, onChange: (items: ChangeProposalItem[]) => void): Unsubscribe {
  return onSnapshot(query(collection(db, 'workflows'), where('reportData.targetKey', '==', targetKey)), (snap) =>
    onChange(snap.docs.map(toChangeProposalItem)),
  );
}

/** 再生リストのタイトル（無ければ null） */
export async function fetchPlaylistTitle(playlistId: string): Promise<string | null> {
  return ((await getDoc(doc(db, 'playlists', playlistId))).data()?.title as string | undefined) ?? null;
}

/** 再生リストに今付いているゲームの名前（無い・未設定なら null） */
export async function fetchPlaylistGameName(playlistId: string): Promise<string | null> {
  return ((await getDoc(doc(db, 'playlists', playlistId))).data()?.gameName as string | undefined) || null;
}

/** 再生リストの今のゲームと掲載状態を購読する（無ければ null） */
export function subscribePlaylistState(
  playlistId: string,
  onChange: (state: { gameName: string; listingStatus: string } | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'playlists', playlistId), (snap) =>
    onChange(snap.exists() ? { gameName: (snap.data().gameName as string) ?? '', listingStatus: (snap.data().listingStatus as string) ?? 'listed' } : null),
  );
}

/** 通報されたレビューの今の内容 */
export interface ReportedReview {
  comment: string | null;
  starRating: number | null;
  userDisplayName: string;
  isHidden: boolean;
}

/** 通報されたレビューを購読する（承認で isHidden が立つのを即時に反映する。削除されていれば null） */
export function subscribeReportedReview(reviewId: string, onChange: (review: ReportedReview | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'reviews', reviewId), (snap) => {
    if (!snap.exists()) return onChange(null);
    const review = snap.data();
    onChange({
      comment: (review.comment as string) ?? null,
      starRating: (review.starRating as number) ?? null,
      userDisplayName: (review.userDisplayName as string) ?? 'ユーザー',
      isHidden: review.isHidden === true,
    });
  });
}

/** プレミテのチャンネルページ（`channels`）があるか */
export async function channelPageExists(channelId: string): Promise<boolean> {
  return (await getDoc(doc(db, 'channels', channelId))).exists();
}

/** タイトルが完全に一致する登録済みのゲーム（無ければ null） */
export async function findGameByTitle(title: string): Promise<{ id: string; title: string } | null> {
  const snap = await getDocs(query(collection(db, 'games'), where('title', '==', title), limit(1)));
  const found = snap.docs[0];
  return found ? { id: found.id, title: (found.data().title as string) ?? title } : null;
}

// ---- 審査 API ----

/** 承認・却下・運営メモの保存（PATCH /api/admin/workflows/[workflowId]）。失敗は AdminApiError（`code` で文言を出し分ける） */
export async function callWorkflowApi(workflowId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return requestAdminApi(`/api/admin/workflows/${encodeURIComponent(workflowId)}`, { method: 'PATCH', body });
}

export interface ProposalVideo {
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string;
}

/** 再生リスト登録提案の動画一覧（YouTube から都度取得。§4.2） */
export async function fetchProposalVideos(workflowId: string): Promise<ProposalVideo[]> {
  const body = await requestAdminApi<{ videos?: ProposalVideo[] }>(`/api/admin/workflows/${encodeURIComponent(workflowId)}/videos`, { method: 'GET' });
  return body.videos ?? [];
}

export interface ApplicationPlaylist {
  youtubePlaylistId: string;
  title: string;
  thumbnailUrl: string;
  itemCount: number;
  isPublic: boolean;
}

/**
 * チャンネル申請の審査詳細に出す情報（§4.4）。掲載チャンネルとしての今の状態と、チャンネルの再生リスト（最大20件、YouTube から都度取得）。
 * YouTube の取得に失敗しても掲載チャンネルとしての状態は返る（`playlists` が null）
 */
export async function fetchApplicationChannelInfo(
  workflowId: string,
): Promise<{ listingStatus: string | null | undefined; playlists: { rows: ApplicationPlaylist[]; total: number } | null }> {
  const res = await callAdminApi<{ listingStatus?: string | null; playlists?: ApplicationPlaylist[]; totalResults?: number }>(
    `/api/admin/workflows/${encodeURIComponent(workflowId)}/channel-playlists`,
    { method: 'GET' },
  );
  const listingStatus = res.body && 'listingStatus' in res.body ? (res.body.listingStatus ?? null) : undefined;
  return { listingStatus, playlists: res.ok ? { rows: res.body.playlists ?? [], total: res.body.totalResults ?? 0 } : null };
}
