/**
 * 提案履歴（/playlists/proposals）。ページ 再生リストを追加する 仕様書 §9.4。
 * 自分が送った再生リスト登録提案を提案日時の新しい順に並べ、提案ごとにステップ表示（確認待ち＝②いまここ／
 * 公開済み＝③／見送り＝②で止めて「見送り」）を出す。取得は本人専用の GET /api/playlists/proposals
 * （運営メモ・内部向けの自由記述を渡さないため Firestore を直接読まない）。
 * 公開済みは再生リストへのリンク、見送りは定型の理由（管理 審査ワークフロー仕様書 §14.4）を表示する。
 * 表示はお問い合わせ履歴と同じくカードのリスト。
 */
'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, SectionHeading } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Tag } from '@/components/ui/Tag';
import { InventoryIcon } from '@/components/ui/icons';
import { PlaylistSummary } from '@/components/playlists/PlaylistSummary';
import { ProposalSteps } from '@/components/playlists/ProposalSteps';

interface ProposalItem {
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

function formatDate(ms: number | null): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('ja-JP');
}

export default function ProposalHistoryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<ProposalItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);

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

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading>提案履歴</SectionHeading>
        <LinkButton href="/playlists/new" variant="secondary" size="sm">
          再生リストを提案する
        </LinkButton>
      </div>

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
          title="提案はまだありません"
          description="おすすめの再生リストを提案すると、運営の確認状況をここで確認できます"
          action={
            <LinkButton href="/playlists/new" variant="secondary">
              再生リストを提案する
            </LinkButton>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Tag emphasis={p.status === 'reviewing'}>{STATUS_LABEL[p.status]}</Tag>
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
          ))}
        </ul>
      )}
    </div>
  );
}
