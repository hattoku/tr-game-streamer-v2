/**
 * 提案する（/propose）。ページ 提案する 仕様書。
 * 再生リストの提案とチャンネルの推薦・申請を1つのページにまとめ、上部の「再生リスト｜チャンネル」で切り替える（§3）。
 * 流入元で分かることは先に判定する（§4）: `channelId`（チャンネル詳細から）はチャンネル固定で切り替えなし、`type=channel` はチャンネル側、
 * `gameId` はゲーム選択済み、`channel` はチャンネル側の入力欄、`as=creator` は実況者向けページから、`url` は再生リストの URL 入力。
 * 旧URL（/playlists/new・/channels/apply）は next.config.js でここへ転送する。未ログインは /login へ（ログイン後に戻す）。
 * 管理者は同じページでその場で公開・登録する（§9）。チャンネル側は管理画面へ案内する。
 */
'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LinkButton } from '@/components/ui/Button';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { ChannelApplyPanel } from '@/components/propose/ChannelApplyPanel';
import { PlaylistProposePanel } from '@/components/propose/PlaylistProposePanel';
import type { ProposeType } from '@/lib/propose-shared';

export default function ProposePage() {
  return (
    <Suspense fallback={<ProposeSkeleton />}>
      <ProposeContent />
    </Suspense>
  );
}

function ProposeContent() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAdmin = role === 'owner' || role === 'operator';

  const fixedChannelId = searchParams.get('channelId');
  const [type, setType] = useState<ProposeType>(() => (!fixedChannelId && searchParams.get('type') === 'channel' ? 'channel' : 'playlist'));
  // 側を移るときに引き継ぐ値（§7）。引き継ぐときだけ移った先のフォームを作り直す（key を変える）。
  // タブで切り替えるだけのときは両方のフォームを残したまま隠すので、入力した内容は側ごとに残る（§3）
  const [channelInput, setChannelInput] = useState(() => searchParams.get('channel') ?? '');
  const [presetChannelId, setPresetChannelId] = useState<string | null>(null);
  const [playlistKey, setPlaylistKey] = useState(0);
  const [channelKey, setChannelKey] = useState(0);
  const [done, setDone] = useState(false);
  // 実況者向けページから来たか（側を移ってアドレスのクエリが外れても覚えておく）
  const [asCreator] = useState(() => searchParams.get('as') === 'creator');

  // 未ログインはログインページへ。ログイン後にクエリ込みでこの画面へ戻す
  useEffect(() => {
    if (loading || user) return;
    const query = searchParams.toString();
    router.replace(`/login?next=${encodeURIComponent(query ? `${pathname}?${query}` : pathname)}`);
  }, [loading, user, router, pathname, searchParams]);

  function switchType(next: ProposeType, carry?: { channelInput?: string; channelId?: string }) {
    setType(next);
    if (carry && next === 'channel') {
      setChannelInput(carry.channelInput ?? '');
      setChannelKey((k) => k + 1);
    }
    if (carry && next === 'playlist') {
      setPresetChannelId(carry.channelId ?? null);
      setPlaylistKey((k) => k + 1);
    }
    setDone(false);
    // 戻る・共有で同じ側が開くよう、アドレスに側を残す（ほかの流入元のクエリは外す）
    const params = new URLSearchParams();
    if (next === 'channel') params.set('type', 'channel');
    if (next === 'channel' && carry?.channelInput) params.set('channel', carry.channelInput);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  if (loading || !user) return <ProposeSkeleton />;

  return (
    <div className="mx-auto max-w-[720px]">
      {!done && <SectionHeading className="mb-4">{isAdmin ? '追加する' : '提案する'}</SectionHeading>}
      {/* §3 切り替え。チャンネル詳細から来たとき（チャンネル固定）は出さない（§4） */}
      {!done && !fixedChannelId && (
        <Tabs value={type} onValueChange={(v) => switchType(v as ProposeType)} className="mb-4">
          <TabsList aria-label="提案するもの">
            <TabsTrigger value="playlist">再生リスト</TabsTrigger>
            <TabsTrigger value="channel">チャンネル</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div hidden={type !== 'playlist'}>
        <PlaylistProposePanel
          key={`playlist-${playlistKey}`}
          isAdmin={isAdmin}
          fixedChannelId={fixedChannelId}
          presetChannelId={presetChannelId}
          initialGameId={playlistKey === 0 ? searchParams.get('gameId') : null}
          initialUrl={playlistKey === 0 ? searchParams.get('url') : null}
          onSwitchToChannel={(input) => switchType('channel', { channelInput: input })}
          onDoneChange={(d) => type === 'playlist' && setDone(d)}
        />
      </div>
      {!fixedChannelId && (
        <div hidden={type !== 'channel'}>
          {isAdmin ? (
            <Card className="flex flex-col gap-3">
              <p className="text-base text-text-secondary">管理者は掲載チャンネル画面から直接登録できます。</p>
              <LinkButton href="/admin/collection/channels" variant="primary" className="w-fit">
                掲載チャンネル画面へ
              </LinkButton>
            </Card>
          ) : (
            <ChannelApplyPanel
              key={`channel-${channelKey}`}
              initialInput={channelInput}
              asCreator={asCreator}
              onSwitchToPlaylist={(youtubeChannelId) => switchType('playlist', { channelId: youtubeChannelId })}
              onDoneChange={(d) => type === 'channel' && setDone(d)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ProposeSkeleton() {
  return (
    <div className="mx-auto max-w-[720px]">
      <Skeleton className="mb-5 h-6 w-[200px]" />
      <div className="flex flex-col gap-4 rounded-[12px] border border-border-card bg-gradient-card p-[18px] shadow-card">
        <Skeleton className="h-3 w-[90px]" />
        <Skeleton className="h-10 w-full rounded-[7px]" />
        <Skeleton className="h-3 w-[60%]" />
        <div className="flex justify-end">
          <Skeleton className="h-10 w-[100px] rounded-[8px]" />
        </div>
      </div>
    </div>
  );
}
