/**
 * 掲載チャンネル（/admin/collection/channels）。管理 AI運営者向け収集候補レビューUI仕様書 v3.3 §9、
 * 管理_Ai運営者 コンテンツ収集機能仕様書 v4.3 §10.2・§10.6。
 *
 * 掲載チャンネル（登録済み）の掲載方法（自動／確認）・ピン留め（段階5。旧: 表示順）・タグの設定、掲載から外す・掲載を止める・戻す操作を行う。
 * 登録済みの行には人気の点数と内訳を出し、「人気の数字を今すぐ集計する」で集計できる（v3.4 §9.2、共通 人気のチャンネル 集計 仕様書）。
 * 登録済みにしたチャンネルは、その場で1回巡回して再生リストを取り込む。
 *
 * 名前（1行1件）またはチャンネルURL・@ハンドルで追加し、名前は YouTube のチャンネル検索で候補を出して確定する。
 * 名前検索は1件約101ユニットかかるため、まとめて特定は1回40件まで（80件なら2日に分ける。§6）。
 * 確定したチャンネル（探索中）にはチャンネル単位のタグ（運営者タグ）を設定でき、承認時に付与される。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Tag } from '@/components/ui/Tag';
import { CollectionNav } from '@/components/admin/collection/CollectionNav';
import { ChannelAvatar } from '@/components/admin/collection/ChannelAvatar';
import { useToast } from '@/components/ui/Toast';
import { ChevronLeftIcon, ExternalLinkIcon, UsersIcon } from '@/components/ui/icons';
import { fetchTagsMap, type TagInfo } from '@/lib/tags';
import { groupOperatorTags } from '@/lib/tag-categories';
import { COLLECTION_DAILY_QUOTA_LIMIT, NAME_SEARCH_COST } from '@/lib/collection-quota-shared';
import {
  countListing,
  fetchCollectionQuotaUsedToday,
  fetchExplorationChannels,
  fetchPopularityOverview,
  formatDateTime,
  formatSubscribers,
  postAdminApi,
  quotaExceededMessage,
  type ExplorationChannel,
  type ExplorationChannelStatus,
  type PopularityOverview,
} from '@/lib/collection-admin';
import { popularityScore, RECENT_DAYS, ZERO_POPULARITY } from '@/lib/popularity-shared';

const RESOLVE_BATCH = 40;

const TAB_ORDER: ExplorationChannelStatus[] = ['pending_confirm', 'unresolved', 'active', 'excluded', 'opted_out'];
const TAB_LABEL: Record<ExplorationChannelStatus, string> = {
  pending_confirm: '確認待ち',
  unresolved: '未特定',
  active: '登録済み',
  excluded: '掲載しない',
  opted_out: '掲載停止',
};

const AUTHORIZED_VIA_LABEL: Record<string, string> = {
  admin: '運営の登録',
  creator_application: '本人・事務所の申請',
  viewer_recommendation: '視聴者の推薦',
  migration: '移行',
};

export default function AdminExplorationChannelsPage() {
  const { toast } = useToast();
  const [channels, setChannels] = useState<ExplorationChannel[] | null>(null);
  const [tagsMap, setTagsMap] = useState<Map<string, TagInfo>>(new Map());
  const [quotaUsed, setQuotaUsed] = useState<number | null>(null);
  const [tab, setTab] = useState<ExplorationChannelStatus>('pending_confirm');
  const [lines, setLines] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Record<string, string>>({});
  const [refInputs, setRefInputs] = useState<Record<string, string>>({});
  const [tagTarget, setTagTarget] = useState<ExplorationChannel | null>(null);
  const [draftTagIds, setDraftTagIds] = useState<Set<string>>(new Set());
  const [listingCounts, setListingCounts] = useState<Record<string, { listed: number; unconfirmed: number }>>({});
  const [orderInputs, setOrderInputs] = useState<Record<string, string>>({});
  const [popularity, setPopularity] = useState<PopularityOverview | null>(null);
  // 掲載から外す・掲載を止める（理由メモとお問い合わせID）
  const [offTarget, setOffTarget] = useState<{ channel: ExplorationChannel; kind: 'exclude' | 'opt_out' } | null>(null);
  const [offNote, setOffNote] = useState('');
  const [offInquiry, setOffInquiry] = useState('');

  async function reload() {
    const [list, used, pop] = await Promise.all([
      fetchExplorationChannels(),
      fetchCollectionQuotaUsedToday(),
      fetchPopularityOverview().catch(() => null),
    ]);
    setChannels(list);
    setQuotaUsed(used);
    setPopularity(pop);
    // 登録済みのチャンネルごとの再生リスト数（掲載中・確認待ち。件数の集計）
    const active = list.filter((c) => c.status === 'active');
    const entries = await Promise.all(
      active.map(async (c) => [c.id, { listed: await countListing('listed', c.id).catch(() => 0), unconfirmed: await countListing('unconfirmed', c.id).catch(() => 0) }] as const),
    );
    setListingCounts(Object.fromEntries(entries));
  }

  useEffect(() => {
    // 非同期 IIFE にして、effect 本体で同期的に setState しない形にする（react-hooks/set-state-in-effect）
    (async () => {
      const [, map] = await Promise.all([reload(), fetchTagsMap()]);
      setTagsMap(map);
    })();
  }, []);

  const counts = useMemo(() => {
    const c: Record<ExplorationChannelStatus, number> = { pending_confirm: 0, unresolved: 0, active: 0, excluded: 0, opted_out: 0 };
    channels?.forEach((ch) => c[ch.status]++);
    return c;
  }, [channels]);

  const visible = useMemo(() => (channels ?? []).filter((c) => c.status === tab), [channels, tab]);
  const tagGroups = useMemo(() => groupOperatorTags([...tagsMap.values()], 'playlist'), [tagsMap]);
  const remaining = quotaUsed === null ? null : Math.max(0, COLLECTION_DAILY_QUOTA_LIMIT - quotaUsed);

  /** 管理APIを呼んで結果をトーストで知らせる。成功したら true を返す */
  async function run(key: string, path: string, body: unknown, onOk: (resBody: Record<string, unknown>) => string | null): Promise<boolean> {
    setBusy(key);
    let succeeded = false;
    try {
      const res = await postAdminApi(path, body);
      if (res.status === 429) {
        toast({ type: 'error', message: quotaExceededMessage(res.body.remaining) });
      } else if (!res.ok) {
        toast({ type: 'error', message: errorMessage(res.body.error) });
      } else {
        succeeded = true;
        const message = onOk(res.body);
        if (message) toast({ type: 'success', message });
      }
      await reload();
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setBusy(null);
    }
    return succeeded;
  }

  function errorMessage(error: unknown): string {
    switch (error) {
      case 'duplicate_channel':
        return 'このチャンネルは既に登録されています（掲載停止中のチャンネルは、掲載停止のタブで再開してください）';
      case 'invalid_status':
        return 'このチャンネルの状態では実行できません';
      case 'channel_not_resolved':
        return 'YouTubeのチャンネルが決まっていません。未特定に戻してから特定してください';
      case 'channel_not_found':
        return 'チャンネルが見つかりませんでした。URLを確認してください';
      case 'invalid_ref':
        return 'チャンネルのURL・@ハンドル・チャンネルIDを入力してください';
      case 'too_many_lines':
        return '一度に追加できるのは200行までです';
      default:
        return '処理に失敗しました';
    }
  }

  function handleAdd() {
    run('add', '/api/admin/collection/channels', { action: 'add', lines }, (b) => {
      setLines('');
      const notFound = Array.isArray(b.notFound) ? b.notFound.length : 0;
      return `追加しました（名前 ${b.addedNames}件・URL指定 ${b.addedActive}件、重複 ${b.duplicates}件${notFound ? `、見つからないURL ${notFound}件` : ''}）。URL指定のチャンネルは再生リストを取り込みました`;
    });
  }

  function handleResolveNames() {
    run('resolve', '/api/admin/collection/channels', { action: 'resolve_names', limit: RESOLVE_BATCH }, (b) => {
      setTab('pending_confirm');
      const errors = Array.isArray(b.errors) && b.errors.length > 0 ? '（途中でエラーが出たため打ち切りました）' : '';
      return `${b.resolved}件に候補が見つかりました（候補なし ${b.noResult}件）${errors}`;
    });
  }

  function openTagModal(channel: ExplorationChannel) {
    setTagTarget(channel);
    setDraftTagIds(new Set(channel.tagIds));
  }

  function toggleDraftTag(id: string) {
    setDraftTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveTags() {
    if (!tagTarget) return;
    const saved = await run('tags', '/api/admin/collection/channels', { action: 'set_tags', id: tagTarget.id, tagIds: [...draftTagIds] }, () => 'タグを保存しました');
    // 失敗時は選択中のタグを失わないようモーダルを開いたままにする
    if (saved) setTagTarget(null);
  }

  async function confirmOff() {
    if (!offTarget) return;
    const { channel, kind } = offTarget;
    const ok = await run(
      `${kind}-${channel.id}`,
      '/api/admin/collection/channels',
      { action: kind, id: channel.id, note: offNote, ...(kind === 'opt_out' ? { inquiryId: offInquiry } : {}) },
      (b) => `${b.turnedOff}件の再生リストを非表示にしました`,
    );
    if (ok) setOffTarget(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading>コンテンツ収集</SectionHeading>
      <CollectionNav />
      <h2 className="text-xl font-medium text-text-primary">掲載チャンネル</h2>

      <Card className="flex flex-col gap-3">
        <Field
          label="チャンネルを追加"
          htmlFor="channel-lines"
          hint="1行に1件。名前はあとでYouTubeのチャンネル検索で特定します。チャンネルURL・@ハンドルならすぐ特定します"
        >
          <Textarea id="channel-lines" rows={5} value={lines} onChange={(e) => setLines(e.target.value)} placeholder={'キヨ\nhttps://www.youtube.com/@example'} />
        </Field>
        <div className="flex justify-end">
          <Button variant="primary" onClick={handleAdd} loading={busy === 'add'} disabled={!lines.trim() || busy !== null}>
            追加する
          </Button>
        </div>
      </Card>

      <p className="text-md text-text-tertiary">
        本日のYouTube API消費（コンテンツ収集分）: {quotaUsed ?? '-'} / {COLLECTION_DAILY_QUOTA_LIMIT.toLocaleString('ja-JP')} ユニット
      </p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ExplorationChannelStatus)}>
        <TabsList aria-label="状態で絞り込み">
          {TAB_ORDER.map((s) => (
            <TabsTrigger key={s} value={s} count={counts[s]}>
              {TAB_LABEL[s]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'active' && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-base text-text-secondary" data-testid="popularity-last-run">
            人気の数字: 最後に集計 {formatDateTime(popularity?.lastRunAt ?? null)}（毎日 4:00 にも自動で集計します）
          </p>
          <Button
            variant="secondary"
            loading={busy === 'popularity'}
            disabled={busy !== null}
            onClick={() =>
              run('popularity', '/api/admin/popularity/recompute', {}, (b) => `${Number(b.processedCount ?? 0).toLocaleString('ja-JP')} チャンネルを集計しました`)
            }
          >
            人気の数字を今すぐ集計する
          </Button>
        </Card>
      )}

      {tab === 'unresolved' && counts.unresolved > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-base text-text-secondary">
            名前でチャンネルを検索し、候補を出します（1件あたり約{NAME_SEARCH_COST}ユニット）。
            {remaining !== null && ` 今日はあと${Math.floor(remaining / NAME_SEARCH_COST)}件まで実行できます。`}
          </p>
          <Button
            variant="secondary"
            onClick={handleResolveNames}
            loading={busy === 'resolve'}
            disabled={busy !== null || (remaining !== null && remaining < NAME_SEARCH_COST)}
          >
            名前からまとめて特定（最大{RESOLVE_BATCH}件）
          </Button>
        </Card>
      )}

      {channels === null ? (
        <Card>
          <SkeletonText lines={4} />
        </Card>
      ) : visible.length === 0 ? (
        <EmptyState icon={<UsersIcon />} title={`${TAB_LABEL[tab]}のチャンネルはありません`} description="上のフォームから名前やURLで追加できます" />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((c) => (
            <li key={c.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  {c.status === 'active' && <ChannelAvatar src={c.channelIconUrl} alt="" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-medium text-text-primary">{c.status === 'active' ? c.channelTitle : c.name}</p>
                    {c.status === 'active' && (
                      <p className="text-md text-text-tertiary">
                        {c.name !== c.channelTitle && <>登録名: {c.name} ・ </>}
                        {c.subscriberCount !== null && <>{formatSubscribers(c.subscriberCount)} ・ </>}最終巡回 {formatDateTime(c.lastSweptAt)}
                        {c.lastSweepNewCount !== null && `（新しく取り込んだ ${c.lastSweepNewCount}件）`}
                      </p>
                    )}
                    {(c.status === 'excluded' || c.status === 'opted_out') && c.statusNote && <p className="text-md text-text-tertiary">メモ: {c.statusNote}</p>}
                  </div>
                  {c.status === 'active' && c.youtubeChannelId && (
                    <a
                      href={`https://www.youtube.com/channel/${c.youtubeChannelId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-md text-text-tertiary hover:text-text-primary"
                    >
                      YouTube <ExternalLinkIcon size={12} />
                    </a>
                  )}
                </div>

                {c.status === 'pending_confirm' && (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-md text-text-tertiary">
                      {c.searchCandidates.length > 0 ? '正しいチャンネルを選んでください' : '候補が見つかりませんでした。URLで指定するか除外してください'}
                    </legend>
                    {c.searchCandidates.map((cand) => (
                      <label key={cand.youtubeChannelId} className="flex cursor-pointer items-center gap-3 rounded-[8px] px-2 py-1 hover:bg-bg-hover">
                        <input
                          type="radio"
                          name={`cand-${c.id}`}
                          checked={selectedCandidate[c.id] === cand.youtubeChannelId}
                          onChange={() => setSelectedCandidate((prev) => ({ ...prev, [c.id]: cand.youtubeChannelId }))}
                        />
                        <ChannelAvatar src={cand.iconUrl} alt="" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base text-text-primary">{cand.title}</span>
                          <span className="block text-sm text-text-muted">{formatSubscribers(cand.subscriberCount)}</span>
                        </span>
                        <a
                          href={`https://www.youtube.com/channel/${cand.youtubeChannelId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-text-muted hover:text-text-primary"
                          aria-label={`${cand.title}をYouTubeで開く`}
                        >
                          <ExternalLinkIcon size={14} />
                        </a>
                      </label>
                    ))}
                    {c.searchCandidates.length > 0 && (
                      <div>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={!selectedCandidate[c.id] || busy !== null}
                          loading={busy === `confirm-${c.id}`}
                          onClick={() =>
                            run(`confirm-${c.id}`, '/api/admin/collection/channels', { action: 'confirm', id: c.id, youtubeChannelId: selectedCandidate[c.id] }, () => '確定しました')
                          }
                        >
                          このチャンネルで確定
                        </Button>
                      </div>
                    )}
                  </fieldset>
                )}

                {c.status === 'active' && (
                  <div className="flex flex-col gap-2 text-md text-text-tertiary">
                    <p>
                      掲載の入口: {AUTHORIZED_VIA_LABEL[c.authorizedVia ?? ''] ?? '-'} ・ 再生リスト 掲載中 {listingCounts[c.id]?.listed ?? '-'}件・
                      <Link href={`/admin/collection?channel=${c.id}`} className="underline">
                        確認待ち {listingCounts[c.id]?.unconfirmed ?? '-'}件
                      </Link>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>掲載方法:</span>
                      <Chip active={c.publishMode === 'confirm'} disabled={busy !== null} onClick={() => c.publishMode !== 'confirm' && run(`mode-${c.id}`, '/api/admin/collection/channels', { action: 'set_mode', id: c.id, publishMode: 'confirm' }, () => '確認してから掲載にしました')}>
                        確認してから掲載
                      </Chip>
                      <Chip active={c.publishMode === 'auto'} disabled={busy !== null} onClick={() => c.publishMode !== 'auto' && run(`mode-${c.id}`, '/api/admin/collection/channels', { action: 'set_mode', id: c.id, publishMode: 'auto' }, () => '自動で掲載にしました（この先に取り込む再生リストから）')}>
                        自動で掲載
                      </Chip>
                      <span className="ml-2">ピン留め（先頭に出す順）:</span>
                      <Input
                        value={orderInputs[c.id] ?? (c.featuredOrder === null ? '' : String(c.featuredOrder))}
                        onChange={(e) => setOrderInputs((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        onBlur={() => {
                          const raw = (orderInputs[c.id] ?? '').trim();
                          if (orderInputs[c.id] === undefined) return;
                          const value = raw === '' ? null : Number(raw);
                          if (value !== null && !Number.isFinite(value)) return;
                          if (value === c.featuredOrder) return;
                          void run(`order-${c.id}`, '/api/admin/collection/channels', { action: 'set_order', id: c.id, featuredOrder: value }, () =>
                            value === null ? 'ピン留めを外しました' : 'ピン留めを保存しました',
                          );
                        }}
                        inputMode="numeric"
                        aria-label={`${c.channelTitle ?? c.name}のピン留め`}
                        placeholder="空欄で外す"
                        className="w-28"
                      />
                    </div>
                    <PopularityLine counts={c.youtubeChannelId ? popularity?.channels[c.youtubeChannelId] : undefined} loaded={popularity !== null} everRun={!!popularity?.lastRunAt} />
                  </div>
                )}

                {c.status === 'active' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-md text-text-tertiary">チャンネル単位のタグ:</span>
                    {c.tagIds.length === 0 ? (
                      <span className="text-md text-text-muted">なし</span>
                    ) : (
                      c.tagIds.map((id) => <Tag key={id}>{tagsMap.get(id)?.name ?? id}</Tag>)
                    )}
                  </div>
                )}

                {(c.status === 'unresolved' || c.status === 'pending_confirm') && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={refInputs[c.id] ?? ''}
                      onChange={(e) => setRefInputs((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder="チャンネルURL または @ハンドル"
                      aria-label={`${c.name}のチャンネルURL`}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!refInputs[c.id]?.trim() || busy !== null}
                      loading={busy === `ref-${c.id}`}
                      onClick={() => run(`ref-${c.id}`, '/api/admin/collection/channels', { action: 'set_ref', id: c.id, ref: refInputs[c.id] }, () => 'チャンネルを特定しました')}
                    >
                      URLで指定
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2">
                  {c.status === 'unresolved' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null || (remaining !== null && remaining < NAME_SEARCH_COST)}
                      loading={busy === `resolve-${c.id}`}
                      onClick={() =>
                        run(`resolve-${c.id}`, '/api/admin/collection/channels', { action: 'resolve_names', id: c.id }, () => {
                          setTab('pending_confirm');
                          return '検索しました';
                        })
                      }
                    >
                      名前で検索
                    </Button>
                  )}
                  {c.status === 'active' && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => openTagModal(c)} disabled={busy !== null}>
                        タグを設定
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy !== null}
                        loading={busy === `explore-${c.id}`}
                        onClick={() =>
                          run(`explore-${c.id}`, '/api/admin/collection/explore', { explorationChannelId: c.id }, (b) => `新しい再生リストを${b.candidatesFound}件取り込みました`)
                        }
                      >
                        このチャンネルだけ巡回
                      </Button>
                      <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => { setOffNote(''); setOffTarget({ channel: c, kind: 'exclude' }); }}>
                        掲載から外す
                      </Button>
                      <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => { setOffNote(''); setOffInquiry(''); setOffTarget({ channel: c, kind: 'opt_out' }); }}>
                        掲載を止める
                      </Button>
                    </>
                  )}
                  {c.status === 'excluded' && (
                    <>
                      {c.youtubeChannelId ? (
                        <Button variant="secondary" size="sm" disabled={busy !== null} loading={busy === `relist-${c.id}`} onClick={() => run(`relist-${c.id}`, '/api/admin/collection/channels', { action: 'relist', id: c.id }, (b) => `掲載しました（再生リスト${b.restored}件を元に戻しました）`)}>
                          掲載する
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => run(`status-${c.id}`, '/api/admin/collection/channels', { action: 'restore', id: c.id }, () => '未特定に戻しました')}>
                          未特定に戻す
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => { setOffNote(''); setOffInquiry(''); setOffTarget({ channel: c, kind: 'opt_out' }); }}>
                        掲載を止める
                      </Button>
                    </>
                  )}
                  {c.status === 'opted_out' && (
                    <Button variant="secondary" size="sm" disabled={busy !== null} loading={busy === `resume-${c.id}`} onClick={() => run(`resume-${c.id}`, '/api/admin/collection/channels', { action: 'resume', id: c.id }, (b) => `掲載を再開しました（再生リスト${b.restored}件を元に戻しました）`)}>
                      掲載を再開する
                    </Button>
                  )}
                  {c.status === 'active' || c.status === 'excluded' || c.status === 'opted_out' ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => run(`status-${c.id}`, '/api/admin/collection/channels', { action: 'exclude', id: c.id }, () => '除外しました')}
                    >
                      除外
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={offTarget !== null}
        onOpenChange={(open) => !open && setOffTarget(null)}
        title={offTarget?.kind === 'opt_out' ? '掲載を止める' : '掲載から外す'}
        description={
          offTarget?.kind === 'opt_out'
            ? `実況者・事務所からの申し出で、${offTarget.channel.channelTitle ?? offTarget.channel.name}の再生リストを今すぐすべて非表示にします。データは消しません。`
            : `${offTarget?.channel.channelTitle ?? offTarget?.channel.name ?? ''}の再生リスト（掲載中 ${offTarget ? (listingCounts[offTarget.channel.id]?.listed ?? 0) : 0}件を含む）を、すべて非表示にします。データは消しません。`
        }
        maxWidthClassName="max-w-[520px]"
      >
        <div className="flex flex-col gap-3">
          {offTarget?.kind === 'opt_out' && (
            <Field label="申し出のお問い合わせID（任意）" htmlFor="off-inquiry">
              <Input id="off-inquiry" value={offInquiry} onChange={(e) => setOffInquiry(e.target.value)} />
            </Field>
          )}
          <Field label="理由メモ（運営内部向け・任意）" htmlFor="off-note">
            <Textarea id="off-note" rows={3} value={offNote} onChange={(e) => setOffNote(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOffTarget(null)} disabled={busy !== null}>
              キャンセル
            </Button>
            <Button variant="primary" onClick={confirmOff} loading={busy !== null && busy.endsWith(offTarget?.channel.id ?? '')}>
              {offTarget?.kind === 'opt_out' ? '掲載を止める' : '掲載から外す'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={tagTarget !== null}
        onOpenChange={(open) => !open && setTagTarget(null)}
        title="チャンネル単位のタグ"
        description="このチャンネルの再生リストを掲載するときに、固定タグとして付けます"
        maxWidthClassName="max-w-[560px]"
      >
        <div className="flex flex-col gap-4">
          <div className="flex max-h-[55dvh] flex-col gap-3 overflow-y-auto">
            {tagGroups.map((group) => (
              <section key={group.category} className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-text-tertiary">{group.category}</h3>
                <div className="flex flex-wrap gap-2">
                  {group.tags.map((t) => (
                    <Chip key={t.id} active={draftTagIds.has(t.id)} onClick={() => toggleDraftTag(t.id)}>
                      {t.name}
                    </Chip>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTagTarget(null)} disabled={busy !== null}>
              キャンセル
            </Button>
            <Button variant="primary" onClick={saveTags} loading={busy === 'tags'}>
              保存する
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** 人気の点数と内訳（§9.2 v3.4）。一度も集計していなければ「人気 0点（未集計）」 */
function PopularityLine({ counts, loaded, everRun }: { counts: PopularityOverview['channels'][string] | undefined; loaded: boolean; everRun: boolean }) {
  if (!loaded) return <p>人気: -</p>;
  const c = counts ?? ZERO_POPULARITY;
  return (
    <p data-testid="channel-popularity">
      人気 {popularityScore(c).toLocaleString('ja-JP')}点（マイリスト {c.mylistUsers}人・レビュー {c.reviewUsers}人・視聴 {c.viewerUsers}人／直近{RECENT_DAYS}日{' '}
      {c.recentMylistUsers}・{c.recentReviewUsers}・{c.recentViewerUsers}人）{everRun ? '' : '（未集計）'}
    </p>
  );
}
