/**
 * 審査ワークフロー詳細のうち、チャンネル申請（type: "channel_application"、リブランディング段階6）。
 * 管理 審査ワークフロー仕様書 §15.2・§15.4。チャンネルのアイコン・名前・登録者数・YouTube へのリンク、
 * チャンネルの再生リスト（最大20件、都度取得）、申請者の種別・理由、掲載チャンネルとしての今の状態を出す。
 * 承認すると PATCH /api/admin/workflows/[workflowId] が掲載チャンネルに加え（確認してから掲載）、再生リストを1回取り込む。
 * 却下は定型の見送り理由が必須で、自由記述は内部メモ（申請者には見せない）。
 */
'use client';

import { useEffect, useState } from 'react';
import { type DocumentData } from 'firebase/firestore';
import { auth } from '@/lib/firebase';
import { Card, CardDivider } from '@/components/ui/Card';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ExternalLinkIcon } from '@/components/ui/icons';
import {
  callWorkflowApi,
  isPendingStatus,
  WorkflowApiError,
  WorkflowDecisionButtons,
  WorkflowDecisionModal,
  WorkflowDecisionNote,
  WorkflowHeader,
  WorkflowMemo,
  type DecisionAction,
  type WorkflowStatus,
} from './shared';
import {
  APPLICANT_TYPE_ADMIN_LABEL,
  CHANNEL_APPLICATION_REJECT_REASONS,
  channelApplicationRejectReasonLabel,
  EXPLORATION_STATUS_LABEL,
  type ApplicantType,
} from '@/lib/channel-application-shared';
import { formatSubscribers } from '@/lib/collection-admin';

const DECIDE_ERRORS: Record<string, string> = {
  channel_opted_out: 'このチャンネルは掲載停止中のため承認できません。掲載チャンネル画面で掲載を再開してから承認してください',
  already_processed: 'ほかの操作で処理中か、すでに処理済みです。画面を再読み込みして確認してください',
};

interface PlaylistRow {
  youtubePlaylistId: string;
  title: string;
  thumbnailUrl: string;
  itemCount: number;
  isPublic: boolean;
}

export function ChannelApplicationDetail({ workflowId, data }: { workflowId: string; data: DocumentData }) {
  const { toast } = useToast();
  const status = (data.status as WorkflowStatus) ?? 'reviewing_lv1';
  const pending = isPendingStatus(status);
  const proposal = data.proposalData ?? {};
  const youtubeChannelId = (proposal.youtubeChannelId as string) ?? '';
  const applicantType = (proposal.applicantType as ApplicantType) ?? 'viewer';
  const rejectCode = proposal.rejectReasonCode as string | undefined;

  const [confirmAction, setConfirmAction] = useState<DecisionAction | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<{ rows: PlaylistRow[]; total: number } | null>(null);
  const [playlistsError, setPlaylistsError] = useState(false);
  const [listingStatus, setListingStatus] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!pending) return;
    (async () => {
      try {
        if (!auth.currentUser) throw new Error('not signed in');
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch(`/api/admin/workflows/${encodeURIComponent(workflowId)}/channel-playlists`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const body = await res.json().catch(() => ({}));
        if ('listingStatus' in body) setListingStatus(body.listingStatus as string | null);
        if (!res.ok) throw new Error(`status ${res.status}`);
        setPlaylists({ rows: body.playlists ?? [], total: body.totalResults ?? 0 });
      } catch {
        setPlaylistsError(true);
      }
    })();
  }, [workflowId, pending]);

  async function handleDecision(action: DecisionAction, comment: string | null, rejectReasonCode: string | null): Promise<boolean> {
    setDecideError(null);
    setDeciding(true);
    try {
      await callWorkflowApi(workflowId, { action, comment, ...(action === 'reject' ? { rejectReasonCode } : {}) });
      toast({ type: 'success', message: action === 'approve' ? '承認し、掲載チャンネルに加えました' : '却下しました' });
      return true;
    } catch (e) {
      const message = e instanceof WorkflowApiError && e.code ? DECIDE_ERRORS[e.code] : undefined;
      if (message) {
        setDecideError(message);
        toast({ type: 'error', message });
        return true;
      }
      toast({ type: 'error', message: '処理に失敗しました。時間をおいて再試行してください' });
      return false;
    } finally {
      setDeciding(false);
    }
  }

  const iconUrl = (proposal.channelIconUrl as string) ?? '';
  const subscribers = (proposal.subscriberCount as number | null | undefined) ?? null;
  const reason = (proposal.reason as string | null | undefined) ?? null;

  return (
    <>
      <Card className="flex flex-col gap-4">
        <WorkflowHeader
          typeLabel="チャンネル申請"
          submittedAt={data.submittedAt?.toMillis?.() ?? 0}
          submittedBy={data.submittedBy as string}
          status={status}
        />
        <CardDivider />

        <div className="flex items-center gap-3">
          {iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={iconUrl} alt="" referrerPolicy="no-referrer" className="size-14 shrink-0 rounded-full bg-bg-btn object-cover" />
          ) : (
            <span className="block size-14 shrink-0 rounded-full bg-bg-btn" />
          )}
          <div className="min-w-0">
            <p className="text-lg font-medium text-text-primary">{(proposal.channelTitle as string) ?? ''}</p>
            <p className="text-md text-text-tertiary">{formatSubscribers(subscribers)}</p>
            <a
              href={`https://www.youtube.com/channel/${youtubeChannelId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-md text-text-secondary underline underline-offset-[3px] hover:text-text-primary"
            >
              YouTubeで開く
              <ExternalLinkIcon size={13} />
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-1 text-base text-text-secondary">
          <p>申請の種別: {APPLICANT_TYPE_ADMIN_LABEL[applicantType] ?? applicantType}（自己申告・本人確認はしていません）</p>
          <p className="whitespace-pre-wrap">申請の理由: {reason || '（未記入）'}</p>
          <p className="break-all">入力されたURL: {(proposal.channelUrl as string) ?? ''}</p>
          {pending && (
            <p>
              掲載チャンネルとしての今の状態:{' '}
              {listingStatus === undefined ? '…' : listingStatus ? (EXPLORATION_STATUS_LABEL[listingStatus] ?? listingStatus) : '未登録'}
            </p>
          )}
        </div>

        {pending && (
          <div className="flex flex-col gap-2">
            <p className="text-md text-text-tertiary">
              チャンネルの再生リスト{playlists ? `（先頭${playlists.rows.length}件 / 全${playlists.total}件）` : ''}
            </p>
            {playlistsError ? (
              <p className="text-base text-text-muted">再生リストを取得できませんでした。「YouTubeで開く」から確認してください</p>
            ) : playlists === null ? (
              <SkeletonText lines={3} />
            ) : playlists.rows.length === 0 ? (
              <p className="text-base text-text-muted">再生リストがありません</p>
            ) : (
              <ul className="flex max-h-[320px] flex-col gap-1 overflow-y-auto rounded-[8px] border border-border-card p-1">
                {playlists.rows.map((p) => (
                  <li key={p.youtubePlaylistId}>
                    <a
                      href={`https://www.youtube.com/playlist?list=${p.youtubePlaylistId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-[6px] p-1 transition-colors duration-[120ms] hover:bg-bg-hover"
                    >
                      <span className="relative aspect-video w-[96px] shrink-0 overflow-hidden rounded-[4px] bg-bg-btn">
                        {p.thumbnailUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
                        )}
                      </span>
                      <span className="line-clamp-2 min-w-0 flex-1 text-base text-text-secondary">{p.title}</span>
                      <span className="shrink-0 text-md text-text-muted">{p.itemCount}本{p.isPublic ? '' : '（非公開）'}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {decideError && pending && (
          <p role="alert" className="text-md text-input-error">
            {decideError}
          </p>
        )}

        {!pending && status === 'rejected' && (
          <p className="text-base text-text-secondary">見送り理由: {channelApplicationRejectReasonLabel(rejectCode) ?? '-'}</p>
        )}
        {!pending && <WorkflowDecisionNote history={data.step2History} rejectLabel="内部メモ" />}

        <CardDivider />
        <WorkflowMemo workflowId={workflowId} operatorMemo={(data.operatorMemo as string) ?? null} />

        {pending && <WorkflowDecisionButtons onReject={() => setConfirmAction('reject')} onApprove={() => setConfirmAction('approve')} disabled={deciding} />}
      </Card>

      <WorkflowDecisionModal
        action={confirmAction}
        onClose={() => setConfirmAction(null)}
        title={{ approve: '申請を承認しますか?', reject: '申請を見送りますか?' }}
        description={{
          approve:
            '承認すると、このチャンネルを掲載チャンネルに加え（確認してから掲載）、再生リストを取り込みます。再生リストは自動掲載の確認画面で確認してから公開されます。申請者に通知します。',
          reject: '見送ると、チャンネルは掲載されません。申請者には選んだ見送り理由を通知します。',
        }}
        onSubmit={(action, comment, code) => handleDecision(action, comment, code)}
        rejectReasons={CHANNEL_APPLICATION_REJECT_REASONS}
      />
    </>
  );
}
