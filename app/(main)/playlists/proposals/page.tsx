/**
 * 提案履歴（/playlists/proposals）。ページ 再生リストを追加する 仕様書 §9.4。
 * 自分が送った再生リスト登録提案を提案日時の新しい順に並べ、提案ごとにステップ表示（確認待ち＝②いまここ／
 * 公開済み＝③／見送り＝②で止めて「見送り」）を出す。取得は本人専用の GET /api/playlists/proposals
 * （運営メモ・内部向けの自由記述を渡さないため Firestore を直接読まない）。
 * 公開済みは再生リストへのリンク、見送りは定型の理由（管理 審査ワークフロー仕様書 §14.4）を表示する。
 * 表示はお問い合わせ履歴と同じくカードのリスト。
 * 審査結果の通知（review_result）は通知一覧に出さないため（ページ ユーザー通知機能仕様書 §4.3、v1.7）、未読のものを
 * ページ上部の「新しい審査結果」に並べ、該当する提案・申請のカードに未読の印を付ける。開いた時点で既読にする
 * （ヘッダーのユーザーアイコンの件数が消える）。再生リストに付けたゲームタイトルの提案は履歴に並ばないので、上部の一覧だけに出る。
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, SectionHeading } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Tag } from '@/components/ui/Tag';
import { UnreadDot } from '@/components/ui/Badge';
import { InventoryIcon } from '@/components/ui/icons';
import { PlaylistSummary } from '@/components/playlists/PlaylistSummary';
import { CHANNEL_APPLICATION_STEPS, ProposalSteps } from '@/components/playlists/ProposalSteps';

interface ChannelApplicationItem {
  kind: 'channel_application';
  id: string;
  status: 'reviewing' | 'approved' | 'rejected';
  channelName: string;
  channelIconUrl: string;
  youtubeChannelId: string;
  submittedAt: number;
  decidedAt: number | null;
  rejectReason: string | null;
}

interface ProposalItem {
  kind?: 'playlist';
  id: string;
  status: 'reviewing' | 'approved' | 'rejected';
  title: string;
  thumbnailUrl: string;
  channelName: string;
  channelIconUrl: string;
  videoCount: number;
  gameName: string;
  isNewGame: boolean;
  submittedAt: number;
  decidedAt: number | null;
  registeredPlaylistId: string | null;
  rejectReason: string | null;
}

const STATUS_LABEL: Record<ProposalItem['status'], string> = {
  reviewing: '確認待ち',
  approved: '公開済み',
  rejected: '見送り',
};

/** 未読の審査結果の通知（新しい審査結果の一覧と、カードの未読の印に使う） */
interface UnseenResult {
  id: string;
  workflowId: string | null;
  playlistId: string | null;
  message: string;
  createdAt: number;
}

function formatDate(ms: number | null): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('ja-JP');
}

export default function ProposalHistoryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<Array<ProposalItem | ChannelApplicationItem> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [unseen, setUnseen] = useState<UnseenResult[]>([]);

  // 未ログインはログイン後にこのページへ戻す（審査結果の通知から開くことがあるため）
  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        if (!auth.currentUser) throw new Error('not signed in');
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/playlists/proposals', { headers: { Authorization: `Bearer ${idToken}` } });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = await res.json();
        setItems(body.proposals ?? []);
      } catch {
        setLoadError(true);
      }
    })();
  }, [user]);

  // 未読の審査結果の通知を読み、表示したうえで既読にする。失敗しても履歴の表示は妨げない
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'notifications'), where('userId', '==', uid), where('isRead', '==', false)));
        const results = snap.docs
          .filter((d) => d.data().type === 'review_result')
          .map((d) => ({
            id: d.id,
            workflowId: (d.data().workflowId as string | undefined) ?? null,
            playlistId: (d.data().playlistId as string | undefined) ?? null,
            message: (d.data().message as string | undefined) ?? '',
            createdAt: d.data().createdAt?.toMillis?.() ?? 0,
          }))
          .sort((a, b) => b.createdAt - a.createdAt);
        if (results.length === 0) return;
        setUnseen(results);
        // writeBatch は 500 件まで（通知一覧の一括既読と同じく 450 件ずつ）
        for (let i = 0; i < results.length; i += 450) {
          const batch = writeBatch(db);
          results.slice(i, i + 450).forEach((r) => batch.update(doc(db, 'notifications', r.id), { isRead: true }));
          await batch.commit();
        }
      } catch (e) {
        console.error('審査結果の通知の読み込みに失敗しました', e);
      }
    })();
  }, [user]);

  const unseenWorkflowIds = new Set(unseen.map((r) => r.workflowId).filter((id): id is string => !!id));

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading>提案履歴</SectionHeading>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/channels/apply" variant="secondary" size="sm">
            チャンネルを申請する
          </LinkButton>
          <LinkButton href="/playlists/new" variant="secondary" size="sm">
            再生リストを提案する
          </LinkButton>
        </div>
      </div>

      {unseen.length > 0 && (
        <Card className="flex flex-col gap-3" data-testid="unseen-review-results">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
            <UnreadDot decorative />
            新しい審査結果
          </h2>
          <ul className="flex flex-col gap-2">
            {unseen.map((r) => (
              <li key={r.id} className="flex flex-col gap-[2px]">
                {r.playlistId ? (
                  <Link href={`/playlists/${r.playlistId}`} className="text-base text-text-primary underline underline-offset-[3px] hover:text-text-secondary">
                    {r.message}
                  </Link>
                ) : (
                  <span className="text-base text-text-primary">{r.message}</span>
                )}
                <span className="text-sm text-text-muted">{formatDate(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {loadError ? (
        <p className="py-10 text-center text-base text-text-muted">読み込みに失敗しました。ページを再読み込みしてください</p>
      ) : items === null ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <SkeletonText lines={3} />
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<InventoryIcon />}
          title="提案・申請はまだありません"
          description="おすすめの再生リストの提案やチャンネルの申請をすると、運営の確認状況をここで確認できます"
          action={
            <LinkButton href="/playlists/new" variant="secondary">
              再生リストを提案する
            </LinkButton>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((p) =>
            p.kind === 'channel_application' ? (
              <li key={p.id}>
                <ChannelApplicationCard item={p} unseen={unseenWorkflowIds.has(p.id)} />
              </li>
            ) : (
            <li key={p.id}>
              <Card className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    {unseenWorkflowIds.has(p.id) && <UnreadDot />}
                    <Tag emphasis={p.status === 'reviewing'}>{STATUS_LABEL[p.status]}</Tag>
                  </span>
                  <span className="text-md text-text-muted">提案日時: {formatDate(p.submittedAt)}</span>
                </div>
                <PlaylistSummary
                  title={p.title}
                  thumbnailUrl={p.thumbnailUrl}
                  channelName={p.channelName}
                  channelIconUrl={p.channelIconUrl}
                  videoCount={p.videoCount}
                  gameName={p.isNewGame && p.status !== 'approved' ? `${p.gameName}（新しいゲームタイトル）` : p.gameName}
                />
                <ProposalSteps current={p.status === 'approved' ? 3 : 2} rejected={p.status === 'rejected'} hereLabel />
                {p.status === 'reviewing' && <p className="text-md text-text-muted">運営の確認待ちです。確認が済むとさがすに表示されます。</p>}
                {p.status === 'rejected' && (
                  <p className="text-base text-text-secondary">
                    見送り理由: {p.rejectReason ?? '掲載の基準に合いませんでした'}
                    <span className="ml-2 text-md text-text-muted">（{formatDate(p.decidedAt)}）</span>
                  </p>
                )}
                {p.status === 'approved' && p.registeredPlaylistId && (
                  <LinkButton href={`/playlists/${p.registeredPlaylistId}`} variant="secondary" size="sm" className="w-fit">
                    公開された再生リストを見る
                  </LinkButton>
                )}
              </Card>
            </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

/** チャンネル申請（ページ チャンネルを申請する 仕様書 §6）。再生リストの提案と並べて出す */
function ChannelApplicationCard({ item, unseen }: { item: ChannelApplicationItem; unseen: boolean }) {
  return (
    <Card className="flex flex-col gap-4" data-testid="channel-application-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {unseen && <UnreadDot />}
          <Tag>チャンネル申請</Tag>
          <Tag emphasis={item.status === 'reviewing'}>{item.status === 'reviewing' ? '確認待ち' : item.status === 'approved' ? '承認' : '見送り'}</Tag>
        </div>
        <span className="text-md text-text-muted">申請日時: {formatDate(item.submittedAt)}</span>
      </div>
      <div className="flex items-center gap-3">
        {item.channelIconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.channelIconUrl} alt="" referrerPolicy="no-referrer" className="size-10 shrink-0 rounded-full bg-bg-btn object-cover" />
        ) : (
          <span className="block size-10 shrink-0 rounded-full bg-bg-btn" />
        )}
        <p className="text-base font-medium text-text-primary">{item.channelName}</p>
      </div>
      <ProposalSteps labels={CHANNEL_APPLICATION_STEPS} current={item.status === 'approved' ? 3 : 2} rejected={item.status === 'rejected'} hereLabel />
      {item.status === 'reviewing' && <p className="text-md text-text-muted">運営の確認待ちです。掲載が決まるとお知らせでお伝えします。</p>}
      {item.status === 'approved' && (
        <p className="text-md text-text-muted">掲載が決まりました。このチャンネルの再生リストは、運営の確認のあと順に公開します。</p>
      )}
      {item.status === 'rejected' && (
        <p className="text-base text-text-secondary">
          見送り理由: {item.rejectReason ?? '掲載の基準に合いませんでした'}
          <span className="ml-2 text-md text-text-muted">（{formatDate(item.decidedAt)}）</span>
        </p>
      )}
    </Card>
  );
}
