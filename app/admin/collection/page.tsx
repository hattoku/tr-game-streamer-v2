/**
 * 自動掲載の確認（/admin/collection）。管理 AI運営者向け収集候補レビューUI仕様書 v3.3 §8。
 *
 * 掲載チャンネルの巡回で取り込んだ再生リストを、掲載状態（確認待ち・掲載中・ゲームではない・対象外・10本未満・
 * チャンネル対象外）ごとに確認・切り替える。段階3までの「収集候補の承認」を置き換えた画面。
 * 掲載する／ゲームではない／対象外にするはチェックボックスでまとめて行える。ゲームは決めなくても掲載できる。
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { StatusBadge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SelectMenu } from '@/components/ui/DropdownMenu';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { ChevronRightIcon, ExternalLinkIcon, InventoryIcon, XIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { GameSelectModal, type GameOption } from '@/components/playlists/GameSelectModal';
import { GameCreateModal } from '@/components/games/GameCreateModal';
import { CollectionNav } from '@/components/admin/collection/CollectionNav';
import { fetchTagsMap, type TagInfo } from '@/lib/tags';
import { matchTitleTagNames } from '@/lib/exploration-rules';
import { DEFAULT_LISTING_RULES, describeListingReason, MAX_RULE_WORD_LENGTH, type ListingRules } from '@/lib/listing-rules';
import { COLLECTION_DAILY_QUOTA_LIMIT } from '@/lib/collection-quota-shared';
import {
  countListing,
  fetchCollectionQuotaUsedToday,
  fetchExplorationChannels,
  fetchLastCollectionBatch,
  fetchListingPlaylists,
  formatDateTime,
  postAdminApi,
  quotaExceededMessage,
  type CollectionBatchLog,
  type ExplorationChannel,
  type ListingPlaylist,
  type ListingTab,
} from '@/lib/collection-admin';

const TABS: Array<{ value: ListingTab; label: string }> = [
  { value: 'unconfirmed', label: '確認待ち' },
  { value: 'listed', label: '掲載中' },
  { value: 'non_game', label: 'ゲームではない' },
  { value: 'excluded', label: '対象外' },
  { value: 'too_short', label: '10本未満' },
  { value: 'channel_off', label: 'チャンネル対象外' },
];

/** 掲載するのは動画一覧の取得があるため少なめに送る（Firebase Hosting 経由の60秒に収める） */
const LIST_CHUNK = 20;
const UNLIST_CHUNK = 100;

const ERROR_LABEL: Record<string, string> = {
  playlist_not_found: 'YouTubeで見つかりません',
  not_public: 'YouTubeで非公開です',
  quota_exceeded: 'YouTube APIの枠が足りません',
  youtube_api_error: 'YouTube APIの呼び出しに失敗しました',
  channel_off: 'チャンネル対象外のため変更できません（掲載チャンネル画面で戻してください）',
  not_found: '再生リストが見つかりません',
};

const EXTERNAL_LINK_CLASS = cn(
  'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-[6px] border border-border-control bg-bg-hover/40 px-[10px] py-1 text-sm font-medium text-text-secondary',
  'transition-colors duration-[120ms] hover:border-text-tertiary hover:text-text-primary',
);
const ADMIN_ACTION_CLASS = cn(
  'inline-flex items-center justify-center whitespace-nowrap rounded-[6px] border border-admin-accent bg-admin-accent/15 px-[10px] py-1 text-sm font-medium text-admin-accent-text',
  'transition-colors duration-[120ms] not-disabled:hover:bg-admin-accent/30 disabled:opacity-50',
);

export default function AdminListingConfirmPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<ListingTab>('unconfirmed');
  const [playlists, setPlaylists] = useState<ListingPlaylist[] | null>(null);
  const [counts, setCounts] = useState<Record<ListingTab, number | null>>({ unconfirmed: null, listed: null, non_game: null, excluded: null, too_short: null, channel_off: null });
  const [games, setGames] = useState<GameOption[]>([]);
  const [tagsMap, setTagsMap] = useState<Map<string, TagInfo>>(new Map());
  const [channels, setChannels] = useState<Map<string, ExplorationChannel>>(new Map());
  const [lastBatch, setLastBatch] = useState<CollectionBatchLog | null>(null);
  const [quotaUsed, setQuotaUsed] = useState<number | null>(null);

  const [channelFilter, setChannelFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removedTags, setRemovedTags] = useState<Map<string, Set<string>>>(new Map());
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [gameSelectFor, setGameSelectFor] = useState<ListingPlaylist | null>(null);
  const [gameCreateFor, setGameCreateFor] = useState<ListingPlaylist | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  // タブやチャンネルを素早く切り替えたとき、前の読み込み結果で上書きしない
  const latestRef = useRef('');

  async function loadPlaylists(nextTab: ListingTab, nextChannel: string) {
    const key = `${nextTab}:${nextChannel}`;
    latestRef.current = key;
    const list = await fetchListingPlaylists(nextTab, nextChannel === 'all' ? undefined : nextChannel);
    if (latestRef.current === key) setPlaylists(list);
  }

  async function loadCounts() {
    const results = await Promise.all(TABS.map((t) => countListing(t.value).catch(() => null)));
    setCounts(Object.fromEntries(TABS.map((t, i) => [t.value, results[i]])) as Record<ListingTab, number | null>);
  }

  async function loadMeta() {
    const [channelList, batch, used] = await Promise.all([fetchExplorationChannels(), fetchLastCollectionBatch(), fetchCollectionQuotaUsedToday()]);
    setChannels(new Map(channelList.map((c) => [c.id, c])));
    setLastBatch(batch);
    setQuotaUsed(used);
  }

  async function loadGames() {
    const gamesSnap = await getDocs(collection(db, 'games'));
    setGames(
      gamesSnap.docs
        .map((d) => ({ id: d.id, title: (d.data().title as string) ?? '', packageImageUrl: (d.data().packageImageUrl as string) ?? null, aliases: (d.data().aliases as string[] | undefined) ?? [] }))
        .sort((a, b) => a.title.localeCompare(b.title, 'ja')),
    );
  }

  useEffect(() => {
    // 非同期 IIFE にして、effect 本体で同期的に setState しない形にする（react-hooks/set-state-in-effect）
    (async () => {
      // 掲載チャンネル画面の「確認待ち N件」から、そのチャンネルで絞り込んで開く（?channel=）
      const channelParam = new URLSearchParams(window.location.search).get('channel') ?? 'all';
      setChannelFilter(channelParam);
      const [map] = await Promise.all([fetchTagsMap(), loadGames(), loadMeta(), loadCounts(), loadPlaylists('unconfirmed', channelParam)]);
      setTagsMap(map);
    })();
  }, []);

  function reset(nextTab: ListingTab, nextChannel: string) {
    setTab(nextTab);
    setChannelFilter(nextChannel);
    setSelected(new Set());
    setRowErrors(new Map());
    setPlaylists(null);
    void loadPlaylists(nextTab, nextChannel);
  }

  async function reloadAll() {
    await Promise.all([loadPlaylists(tab, channelFilter), loadCounts(), loadMeta()]);
  }

  const operatorTagIdByName = useMemo(() => new Map([...tagsMap.values()].filter((t) => t.origin === 'operator').map((t) => [t.name, t.id])), [tagsMap]);

  /** 掲載するときに付けるタグ（チャンネル単位タグ＋タイトル由来のタグ。外したものを除く） */
  function tagIdsFor(p: ListingPlaylist): string[] {
    const fromChannel = channels.get(p.explorationChannelId)?.tagIds ?? [];
    const fromTitle = matchTitleTagNames(p.title).map((n) => operatorTagIdByName.get(n)).filter((id): id is string => !!id);
    const removed = removedTags.get(p.id);
    return [...new Set([...fromChannel, ...fromTitle])].filter((id) => !removed?.has(id) && tagsMap.has(id));
  }

  function removeTag(playlistId: string, tagId: string) {
    setRemovedTags((prev) => new Map(prev).set(playlistId, new Set([...(prev.get(playlistId) ?? []), tagId])));
  }

  const groups = useMemo(() => {
    const byChannel = new Map<string, ListingPlaylist[]>();
    for (const p of playlists ?? []) byChannel.set(p.explorationChannelId, [...(byChannel.get(p.explorationChannelId) ?? []), p]);
    return [...byChannel.entries()].map(([key, items]) => ({ key, title: channels.get(key)?.channelTitle ?? items[0].channelName ?? '（チャンネル不明）', items }));
  }, [playlists, channels]);

  const channelOptions = useMemo(
    () => [{ value: 'all', label: 'すべてのチャンネル' }, ...[...channels.values()].filter((c) => c.status === 'active').map((c) => ({ value: c.id, label: c.channelTitle ?? c.name }))],
    [channels],
  );

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(items: ListingPlaylist[]) {
    const ids = items.map((p) => p.id);
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  async function handleSweep() {
    setSweeping(true);
    try {
      const res = await postAdminApi<{ processedChannels?: number; candidatesFound?: number; autoListed?: number; remaining?: number }>('/api/admin/collection/explore', {});
      if (res.status === 429) toast({ type: 'error', message: quotaExceededMessage(res.body.remaining) });
      else if (!res.ok) toast({ type: 'error', message: '巡回に失敗しました' });
      else toast({ type: 'success', message: `${res.body.processedChannels ?? 0}チャンネルを巡回し、新しい再生リストを${res.body.candidatesFound ?? 0}件取り込みました（自動で掲載 ${res.body.autoListed ?? 0}件）` });
      await reloadAll();
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setSweeping(false);
    }
  }

  /** 選んだ再生リストの掲載状態を切り替える。失敗した行には理由を出す */
  async function handleChange(action: 'list' | 'non_game' | 'excluded' | 'unconfirmed' | 'too_short', label: string) {
    const targets = (playlists ?? []).filter((p) => selected.has(p.id));
    if (targets.length === 0) return;
    const fetching = action === 'list' ? targets.filter((p) => !p.hasVideos).length : 0;
    const message = `${targets.length}件を「${label}」にします。${fetching > 0 ? `\n動画一覧が未取得の${fetching}件は YouTube から取得します（API枠を使います）。` : ''}\nよろしいですか？`;
    if (!window.confirm(message)) return;

    setBusy(true);
    setRowErrors(new Map());
    setProgress({ done: 0, total: targets.length });
    const errors = new Map<string, string>();
    let ok = 0;
    let stopped = false;
    try {
      const chunkSize = action === 'list' ? LIST_CHUNK : UNLIST_CHUNK;
      for (let i = 0; i < targets.length && !stopped; i += chunkSize) {
        const chunk = targets.slice(i, i + chunkSize);
        const body = action === 'list' ? { action, items: chunk.map((p) => ({ playlistId: p.id, tagIds: tagIdsFor(p) })) } : { action, playlistIds: chunk.map((p) => p.id) };
        const res = await postAdminApi<{ results?: Array<{ playlistId: string; ok: boolean; error?: string }>; remaining?: number }>('/api/admin/collection/listing', body);
        if (res.status === 429) {
          toast({ type: 'error', message: quotaExceededMessage(res.body.remaining) });
          stopped = true;
          break;
        }
        if (!res.ok || !res.body.results) {
          toast({ type: 'error', message: '処理に失敗しました' });
          stopped = true;
          break;
        }
        for (const r of res.body.results) {
          if (r.ok) ok++;
          else errors.set(r.playlistId, ERROR_LABEL[r.error ?? ''] ?? r.error ?? '失敗しました');
        }
        setProgress({ done: Math.min(i + chunk.length, targets.length), total: targets.length });
      }
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setProgress(null);
      setBusy(false);
    }
    toast({ type: errors.size > 0 ? 'error' : 'success', message: `${ok}件を「${label}」にしました${errors.size > 0 ? `（失敗 ${errors.size}件）` : ''}` });
    setSelected(new Set([...selected].filter((id) => errors.has(id))));
    setRowErrors(errors);
    await reloadAll();
  }

  async function linkGame(p: ListingPlaylist, gameId: string) {
    setBusy(true);
    const res = await postAdminApi('/api/admin/playlist-game', { action: 'link', playlistId: p.id, gameId });
    setBusy(false);
    if (res.ok || res.status === 409) toast({ type: 'success', message: res.ok ? 'ゲームを付けました' : 'すでにゲームが付いていました' });
    else toast({ type: 'error', message: 'ゲームを付けられませんでした' });
    await loadPlaylists(tab, channelFilter);
  }

  async function unlinkGame(p: ListingPlaylist) {
    if (!window.confirm(`「${p.gameName}」を外して、ゲーム未設定に戻しますか？（このゲームは自動では付け直されません）`)) return;
    setBusy(true);
    const res = await postAdminApi('/api/admin/playlist-game', { action: 'unlink', playlistId: p.id });
    setBusy(false);
    toast(res.ok ? { type: 'success', message: 'ゲーム未設定に戻しました' } : { type: 'error', message: '戻せませんでした' });
    await loadPlaylists(tab, channelFilter);
  }

  const remaining = quotaUsed === null ? null : Math.max(0, COLLECTION_DAILY_QUOTA_LIMIT - quotaUsed);
  const listable = tab !== 'listed' && tab !== 'channel_off';
  const actions: Array<{ action: 'list' | 'non_game' | 'excluded' | 'unconfirmed' | 'too_short'; label: string; primary?: boolean }> = (
    {
      unconfirmed: [{ action: 'list', label: '掲載する', primary: true }, { action: 'non_game', label: 'ゲームではない' }, { action: 'excluded', label: '対象外にする' }],
      listed: [{ action: 'non_game', label: 'ゲームではない' }, { action: 'excluded', label: '対象外にする' }],
      non_game: [{ action: 'list', label: '掲載する', primary: true }, { action: 'excluded', label: '対象外にする' }],
      excluded: [{ action: 'list', label: '掲載する', primary: true }, { action: 'non_game', label: 'ゲームではない' }],
      too_short: [{ action: 'list', label: '掲載する', primary: true }, { action: 'excluded', label: '対象外にする' }],
      channel_off: [],
    } as const
  )[tab].map((a) => ({ ...a }));

  return (
    <div className="flex flex-col gap-5 pb-24">
      <SectionHeading>コンテンツ収集</SectionHeading>
      <CollectionNav />
      <h2 className="text-xl font-medium text-text-primary">自動掲載の確認</h2>

      <Card className="flex flex-wrap items-center justify-between gap-3" data-testid="sweep-status">
        <div className="flex flex-col gap-1 text-md text-text-secondary">
          <p>
            最終巡回: {lastBatch ? `${formatDateTime(lastBatch.executedAt)}（${lastBatch.trigger === 'cron' ? '毎日の自動' : '手動'}。${lastBatch.processedChannels}チャンネル、新しい再生リスト ${lastBatch.candidatesFound}件）` : 'まだありません'}
          </p>
          <p className="text-text-tertiary">
            本日のYouTube API消費（コンテンツ収集分）: {quotaUsed ?? '-'} / {COLLECTION_DAILY_QUOTA_LIMIT.toLocaleString('ja-JP')} ユニット
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setRulesOpen(true)} disabled={busy}>
            判定の言葉
          </Button>
          <Button variant="primary" onClick={handleSweep} loading={sweeping} disabled={busy || (remaining !== null && remaining < 1)}>
            巡回を実行
          </Button>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={(v) => reset(v as ListingTab, channelFilter)}>
        <TabsList aria-label="掲載状態で絞り込み">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} count={counts[t.value] ?? undefined}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <SelectMenu value={channelFilter} onValueChange={(v) => reset(tab, v)} options={channelOptions} prefix="チャンネル" aria-label="チャンネルで絞り込み" align="start" />
      </div>

      {playlists === null ? (
        <Card>
          <SkeletonText lines={4} />
        </Card>
      ) : groups.length === 0 ? (
        <EmptyState icon={<InventoryIcon />} title={`${TABS.find((t) => t.value === tab)!.label}の再生リストはありません`} description="「巡回を実行」で掲載チャンネルの新しい再生リストを取り込めます" />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => {
            const channel = channels.get(group.key);
            const isCollapsed = collapsed.has(group.key);
            const allOn = group.items.every((p) => selected.has(p.id));
            return (
              <section key={group.key} aria-label={group.title} className="overflow-hidden rounded-[12px] border border-admin-border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-admin-border bg-admin-header-bg px-4 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.key)) next.delete(group.key);
                        else next.add(group.key);
                        return next;
                      })
                    }
                    aria-expanded={!isCollapsed}
                    className="flex min-w-0 items-center gap-3 text-left text-lg font-medium text-text-primary"
                  >
                    <ChevronRightIcon size={14} className={cn('shrink-0 transition-transform', !isCollapsed && 'rotate-90')} />
                    <span className="min-w-0">
                      {group.title}
                      <span className="ml-1 text-md font-normal text-text-tertiary">
                        （{group.items.length}件・{channel?.publishMode === 'auto' ? '自動で掲載' : '確認してから掲載'}）
                      </span>
                    </span>
                  </button>
                  {actions.length > 0 && (
                    <label className="inline-flex items-center gap-2 text-md text-text-tertiary">
                      <input type="checkbox" className="size-4" checked={allOn} disabled={busy} onChange={() => toggleGroup(group.items)} />
                      全選択
                    </label>
                  )}
                </div>
                {!isCollapsed && (
                  <ul className="flex flex-col gap-2 bg-bg-base/40 p-3">
                    {group.items.map((p) => {
                      const tagIds = listable ? tagIdsFor(p) : [];
                      const error = rowErrors.get(p.id);
                      return (
                        <li key={p.id}>
                          <Card className={cn('flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-6', selected.has(p.id) && 'border-border-active')}>
                            <div className="flex min-w-0 gap-3">
                              {actions.length > 0 && (
                                <input type="checkbox" className="mt-1 size-4 shrink-0" aria-label={`${p.title}を選択`} checked={selected.has(p.id)} disabled={busy} onChange={() => toggleSelected(p.id)} />
                              )}
                              <a href={`https://www.youtube.com/playlist?list=${p.id}`} target="_blank" rel="noopener noreferrer" className="relative aspect-video w-28 shrink-0 self-start overflow-hidden rounded-[6px] bg-bg-hover md:w-44" aria-label={`${p.title}をYouTubeで開く`}>
                                {p.thumbnailUrl && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={p.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                                )}
                              </a>
                              <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <p className="text-base text-text-primary">{p.title}</p>
                                <p className="text-md text-text-tertiary">
                                  {p.videoCount}本 ・ 作成日 {formatDateTime(p.playlistPublishedAt)}
                                </p>
                                <p className="text-md text-text-secondary" data-testid="listing-reason">
                                  判定: {describeListingReason({ status: p.listingStatus, reason: p.listingReason, setBy: p.listingSetBy, videoCount: p.videoCount, rules: DEFAULT_LISTING_RULES })}
                                  {p.listingSetBy === 'admin' && <span className="text-text-tertiary">（管理者が決定 {formatDateTime(p.listingSetAt)}）</span>}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {/* YouTube の再生リストのページは埋め込みを禁止しているため、別タブで開く */}
                                  <a href={`https://www.youtube.com/playlist?list=${p.id}`} target="_blank" rel="noopener noreferrer" className={EXTERNAL_LINK_CLASS} aria-label={`${p.title}の動画一覧をYouTubeで見る`}>
                                    動画一覧を見る（YouTube）
                                    <ExternalLinkIcon size={14} aria-hidden />
                                  </a>
                                  {(tab === 'listed' || p.hasVideos) && (
                                    <Link href={`/playlists/${p.id}`} className={EXTERNAL_LINK_CLASS}>
                                      プレミテで開く
                                    </Link>
                                  )}
                                </div>
                                {listable && tagIds.length > 0 && (
                                  <div className="mt-1 flex flex-col gap-1">
                                    <p className="text-sm text-text-tertiary">掲載するときに付けるタグ（×で外せる）</p>
                                    <div className="flex flex-wrap gap-1">
                                      {tagIds.map((id) => (
                                        <span key={id} className="inline-flex items-center gap-1 rounded-[4px] bg-bg-hover px-2 py-[2px] text-sm text-text-secondary">
                                          {tagsMap.get(id)?.name}
                                          <button type="button" aria-label={`${tagsMap.get(id)?.name}を外す`} onClick={() => removeTag(p.id, id)} className="text-text-muted hover:text-text-primary" disabled={busy}>
                                            <XIcon size={10} />
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {error && (
                                  <p role="alert" className="text-md text-input-error">
                                    {error}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex min-w-0 flex-col gap-3 rounded-[8px] border border-surface-border bg-bg-base/40 p-3">
                              <p className="flex flex-wrap items-center gap-2 text-md">
                                <span className="text-text-tertiary">ゲーム:</span>
                                {p.gameId ? <StatusBadge>{p.gameName}</StatusBadge> : <StatusBadge>ゲーム未設定</StatusBadge>}
                              </p>
                              {!p.gameId && p.gameHint && <p className="text-sm text-text-tertiary">ヒント: {p.gameHint}</p>}
                              <p className="text-sm text-text-tertiary">ゲームは決めなくても掲載できます。</p>
                              <div className="flex flex-wrap gap-2">
                                <button type="button" className={ADMIN_ACTION_CLASS} disabled={busy} onClick={() => setGameSelectFor(p)} aria-label={`${p.title}のゲームを選ぶ`}>
                                  ゲームを選ぶ
                                </button>
                                <button type="button" className={ADMIN_ACTION_CLASS} disabled={busy} onClick={() => setGameCreateFor(p)} aria-label={`${p.title}のゲームを新規登録して付ける`}>
                                  新規登録して付ける
                                </button>
                                {p.gameId && (
                                  <button type="button" className={ADMIN_ACTION_CLASS} disabled={busy} onClick={() => unlinkGame(p)} aria-label={`${p.title}のゲームを外す`}>
                                    ゲームを外す
                                  </button>
                                )}
                              </div>
                            </div>
                          </Card>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {actions.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-surface-border bg-bg-base/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
            <p className="text-base text-text-secondary">{progress ? `処理中… ${progress.done} / ${progress.total} 件` : `選択中 ${selected.size}件`}</p>
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <Button key={a.action} variant={a.primary ? 'primary' : 'secondary'} onClick={() => handleChange(a.action, a.label)} disabled={selected.size === 0 || busy} loading={busy && progress !== null && !!a.primary}>
                  {a.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      <GameSelectModal
        open={gameSelectFor !== null}
        onOpenChange={(open) => !open && setGameSelectFor(null)}
        games={games}
        onSelect={(g) => {
          if (gameSelectFor) void linkGame(gameSelectFor, g.id);
          setGameSelectFor(null);
        }}
        onAddNew={() => {
          setGameCreateFor(gameSelectFor);
          setGameSelectFor(null);
        }}
      />
      <GameCreateModal
        open={gameCreateFor !== null}
        onOpenChange={(open) => !open && setGameCreateFor(null)}
        initialQuery={gameCreateFor?.gameHint || gameCreateFor?.title}
        onCreated={(g) => {
          setGames((prev) => [...prev, g].sort((a, b) => a.title.localeCompare(b.title, 'ja')));
          if (gameCreateFor) void linkGame(gameCreateFor, g.id);
          setGameCreateFor(null);
        }}
      />
      <RulesModal open={rulesOpen} onOpenChange={setRulesOpen} onRejudged={reloadAll} />
    </div>
  );
}

/** 判定の言葉（除外語・非ゲーム語・最小本数）の編集と、判定し直し（§8.4） */
function RulesModal({ open, onOpenChange, onRejudged }: { open: boolean; onOpenChange: (open: boolean) => void; onRejudged: () => Promise<void> }) {
  const { toast } = useToast();
  const [rules, setRules] = useState<ListingRules | null>(null);
  const [excludedInput, setExcludedInput] = useState('');
  const [nonGameInput, setNonGameInput] = useState('');
  const [busy, setBusy] = useState<'save' | 'rejudge' | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { doc, getDoc } = await import('firebase/firestore');
      const snap = await getDoc(doc(db, 'app_settings', 'listing_rules'));
      const d = snap.data();
      setRules({
        excludedWords: Array.isArray(d?.excludedWords) ? d.excludedWords : DEFAULT_LISTING_RULES.excludedWords,
        nonGameWords: Array.isArray(d?.nonGameWords) ? d.nonGameWords : DEFAULT_LISTING_RULES.nonGameWords,
        minVideoCount: typeof d?.minVideoCount === 'number' ? d.minVideoCount : DEFAULT_LISTING_RULES.minVideoCount,
      });
    })();
  }, [open]);

  function addWord(kind: 'excludedWords' | 'nonGameWords', input: string, clear: () => void) {
    const word = input.trim();
    if (!word || !rules) return;
    if (!rules[kind].includes(word)) setRules({ ...rules, [kind]: [...rules[kind], word] });
    clear();
  }

  async function save() {
    if (!rules) return;
    setBusy('save');
    const res = await postAdminApi('/api/admin/collection/listing-rules', { action: 'save', ...rules });
    setBusy(null);
    toast(res.ok ? { type: 'success', message: '保存しました（次の巡回から新しい再生リストに使います）' } : { type: 'error', message: '保存できませんでした' });
  }

  async function rejudge() {
    if (!window.confirm('自動で決めた掲載状態を、保存済みの言葉の表で判定し直します。管理者が決めたものは変えません。よろしいですか？')) return;
    setBusy('rejudge');
    const res = await postAdminApi<{ changed?: Record<string, number> }>('/api/admin/collection/listing-rules', { action: 'rejudge' });
    setBusy(null);
    if (!res.ok) {
      toast({ type: 'error', message: '判定し直せませんでした' });
      return;
    }
    const c = res.body.changed ?? {};
    toast({ type: 'success', message: `判定し直しました（確認待ち ${c.unconfirmed ?? 0}件・ゲームではない ${c.non_game ?? 0}件・対象外 ${c.excluded ?? 0}件・10本未満 ${c.too_short ?? 0}件に変更）` });
    await onRejudged();
  }

  const section = (label: string, kind: 'excludedWords' | 'nonGameWords', input: string, setInput: (v: string) => void) => (
    <section className="flex flex-col gap-2" aria-label={label}>
      <h3 className="text-md font-medium text-text-primary">{label}</h3>
      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
        {rules?.[kind].map((w) => (
          <Chip key={w} active onClick={() => setRules((r) => (r ? { ...r, [kind]: r[kind].filter((x) => x !== w) } : r))} aria-label={`${w}を削除`}>
            {w} ×
          </Chip>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} maxLength={MAX_RULE_WORD_LENGTH} placeholder="言葉を追加" aria-label={`${label}を追加`} className="min-w-0 flex-1" onKeyDown={(e) => e.key === 'Enter' && addWord(kind, input, () => setInput(''))} />
        <Button variant="secondary" size="sm" onClick={() => addWord(kind, input, () => setInput(''))} disabled={!input.trim()}>
          追加
        </Button>
      </div>
    </section>
  );

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="判定の言葉" description="タイトルに含まれていたら、その状態で取り込みます（大文字小文字・全角半角は区別しません）" maxWidthClassName="max-w-[640px]">
      {rules === null ? (
        <SkeletonText lines={4} />
      ) : (
        <div className="flex flex-col gap-4">
          {section('除外語（対象外にする）', 'excludedWords', excludedInput, setExcludedInput)}
          {section('非ゲーム語（ゲームではないにする）', 'nonGameWords', nonGameInput, setNonGameInput)}
          <label className="flex items-center gap-2 text-md text-text-secondary">
            最小本数（これ未満は10本未満として取り込む）
            <Input type="number" min={1} max={100} value={rules.minVideoCount} onChange={(e) => setRules({ ...rules, minVideoCount: Number(e.target.value) })} className="w-24" aria-label="最小本数" />
          </label>
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="secondary" onClick={rejudge} loading={busy === 'rejudge'} disabled={busy !== null}>
              判定し直す
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy !== null}>
                閉じる
              </Button>
              <Button variant="primary" onClick={save} loading={busy === 'save'} disabled={busy !== null}>
                保存する
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
