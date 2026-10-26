/**
 * 探索対象チャンネル（/admin/collection/channels）。管理 AI運営者向け収集候補レビューUI仕様書 v2.0 §6、
 * 管理_Ai運営者 コンテンツ収集機能仕様書 v3.0 §3.1。
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
import { useToast } from '@/components/ui/Toast';
import { ChevronLeftIcon, ExternalLinkIcon, UsersIcon } from '@/components/ui/icons';
import { fetchTagsMap, type TagInfo } from '@/lib/tags';
import { groupOperatorTags } from '@/lib/tag-categories';
import { COLLECTION_DAILY_QUOTA_LIMIT, NAME_SEARCH_COST } from '@/lib/collection-quota-shared';
import {
  fetchCollectionQuotaUsedToday,
  fetchExplorationChannels,
  formatDateTime,
  formatSubscribers,
  postAdminApi,
  quotaExceededMessage,
  type ExplorationChannel,
  type ExplorationChannelStatus,
} from '@/lib/collection-admin';

const RESOLVE_BATCH = 40;

const TAB_ORDER: ExplorationChannelStatus[] = ['pending_confirm', 'unresolved', 'active', 'excluded'];
const TAB_LABEL: Record<ExplorationChannelStatus, string> = {
  pending_confirm: '確認待ち',
  unresolved: '未特定',
  active: '探索中',
  excluded: '除外',
};

function ChannelAvatar({ src, alt }: { src: string | null; alt: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- YouTube のアイコンURL（外部・可変）をそのまま表示する
    <img src={src} alt={alt} referrerPolicy="no-referrer" className="size-10 shrink-0 rounded-full object-cover" loading="lazy" />
  ) : (
    <span className="size-10 shrink-0 rounded-full bg-bg-hover" />
  );
}

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

  async function reload() {
    const [list, used] = await Promise.all([fetchExplorationChannels(), fetchCollectionQuotaUsedToday()]);
    setChannels(list);
    setQuotaUsed(used);
  }

  useEffect(() => {
    // 非同期 IIFE にして、effect 本体で同期的に setState しない形にする（react-hooks/set-state-in-effect）
    (async () => {
      const [, map] = await Promise.all([reload(), fetchTagsMap()]);
      setTagsMap(map);
    })();
  }, []);

  const counts = useMemo(() => {
    const c: Record<ExplorationChannelStatus, number> = { pending_confirm: 0, unresolved: 0, active: 0, excluded: 0 };
    channels?.forEach((ch) => c[ch.status]++);
    return c;
  }, [channels]);

  const visible = useMemo(() => (channels ?? []).filter((c) => c.status === tab), [channels, tab]);
  const tagGroups = useMemo(() => groupOperatorTags([...tagsMap.values()], 'playlist'), [tagsMap]);
  const remaining = quotaUsed === null ? null : Math.max(0, COLLECTION_DAILY_QUOTA_LIMIT - quotaUsed);

  async function run(key: string, path: string, body: unknown, onOk: (resBody: Record<string, unknown>) => string | null) {
    setBusy(key);
    try {
      const res = await postAdminApi(path, body);
      if (res.status === 429) {
        toast({ type: 'error', message: quotaExceededMessage(res.body.remaining) });
      } else if (!res.ok) {
        toast({ type: 'error', message: errorMessage(res.body.error) });
      } else {
        const message = onOk(res.body);
        if (message) toast({ type: 'success', message });
      }
      await reload();
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setBusy(null);
    }
  }

  function errorMessage(error: unknown): string {
    switch (error) {
      case 'duplicate_channel':
        return 'このチャンネルは既に探索対象に登録されています';
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
      return `追加しました（名前 ${b.addedNames}件・URL指定 ${b.addedActive}件、重複 ${b.duplicates}件${notFound ? `、見つからないURL ${notFound}件` : ''}）`;
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
    await run('tags', '/api/admin/collection/channels', { action: 'set_tags', id: tagTarget.id, tagIds: [...draftTagIds] }, () => 'タグを保存しました');
    setTagTarget(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/collection" className="inline-flex items-center gap-1 text-md text-text-tertiary hover:text-text-primary">
        <ChevronLeftIcon size={14} />
        収集候補に戻る
      </Link>
      <SectionHeading>探索対象チャンネル</SectionHeading>

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
                        {formatSubscribers(c.subscriberCount)} ・ 最終探索 {formatDateTime(c.lastExploredAt)}
                        {c.lastFoundCount !== null && `（新規候補 ${c.lastFoundCount}件）`}
                      </p>
                    )}
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
                          run(`explore-${c.id}`, '/api/admin/collection/explore', { explorationChannelId: c.id }, (b) => `新しい候補を${b.candidatesFound}件追加しました`)
                        }
                      >
                        このチャンネルだけ探索
                      </Button>
                    </>
                  )}
                  {c.status === 'excluded' || c.status === 'active' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() =>
                        run(
                          `status-${c.id}`,
                          '/api/admin/collection/channels',
                          { action: c.status === 'excluded' ? 'restore' : 'exclude', id: c.id },
                          () => (c.status === 'excluded' ? '未特定に戻しました' : '除外しました'),
                        )
                      }
                    >
                      {c.status === 'excluded' ? '未特定に戻す' : '除外'}
                    </Button>
                  ) : (
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
        open={tagTarget !== null}
        onOpenChange={(open) => !open && setTagTarget(null)}
        title="チャンネル単位のタグ"
        description="このチャンネルの再生リストを承認するときに、固定タグとして付けます"
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
