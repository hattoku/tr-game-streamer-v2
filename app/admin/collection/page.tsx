/**
 * 収集候補（/admin/collection）。管理 AI運営者向け収集候補レビューUI仕様書 v2.0 §3〜§5、
 * 管理_Ai運営者 コンテンツ収集機能仕様書 v3.0 §3。
 *
 * チャンネル起点の探索で集めた再生リスト候補をチャンネルごとにまとめて表示し、チェックボックスでまとめて
 * 承認（登録）・却下する。ゲームタイトルは保存時の推定に加え、表示時点のゲームタイトル一覧でも推定し直す
 * （候補保存後に登録されたゲームにも当たるように。§3.4）。推定できないものは、候補の gameQuery を初期値にした
 * ゲーム名の入力欄を出し、承認時にその名前でゲームタイトルを用意する（既存と一致すればそれ、無ければ新規登録。
 * v2.1 §3.5・§4.3）。既存から選ぶ GameSelectModal・楽天を自動検索した GameCreateModal も引き続き使える。
 * 付与するタグ＝探索対象チャンネルのタグ＋タイトル由来のタグ（運営者タグのみ）。行ごとに×で外せる。
 * 承認は20件ずつ（新しいゲーム名を含む候補は5件ずつ）APIに送り、進捗を下部バーに表示する（§4）。
 * v2.2 §3.7: 新規のゲーム名の候補は、表示したら順に（1秒に1件）楽天ブックスを検索して結果を候補に保存し、
 * 名前が一致する商品を選んだ状態で行に出す。違えば候補から選び直すか、楽天なしにできる。
 */
'use client';

import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { SelectMenu } from '@/components/ui/DropdownMenu';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { ChevronRightIcon, InventoryIcon, SearchIcon, XIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { GameSelectModal, type GameOption } from '@/components/playlists/GameSelectModal';
import { GameCreateModal } from '@/components/games/GameCreateModal';
import { RakutenPickModal } from '@/components/admin/collection/RakutenPickModal';
import { CollectionNav } from '@/components/admin/collection/CollectionNav';
import { PlaylistVideosModal } from '@/components/admin/collection/PlaylistVideosModal';
import { fetchTagsMap, type TagInfo } from '@/lib/tags';
import { guessGame, normalizeForMatch } from '@/lib/exploration-rules';
import { COLLECTION_DAILY_QUOTA_LIMIT } from '@/lib/collection-quota-shared';
import { normalizeRakutenGameTitle } from '@/lib/rakuten-shared';
import {
  fetchCandidates,
  fetchCollectionQuotaUsedToday,
  fetchExplorationChannels,
  fetchLastCollectionBatch,
  formatDateTime,
  postAdminApi,
  quotaExceededMessage,
  type CandidateStatus,
  type CollectionBatchLog,
  type CollectionCandidate,
  type ExplorationChannel,
  type RakutenPick,
  type RakutenSearchResult,
} from '@/lib/collection-admin';

// 1回のリクエストの件数。新しいゲーム名を含む候補は、楽天ブックスの検索に1件2秒ほどかかるため少なくする
// （Firebase Hosting 経由のリクエストは60秒で打ち切られる。v2.1 §4.2）
const APPROVE_CHUNK = 20;
const APPROVE_CHUNK_NEW_GAMES = 5;
const MAX_GAME_TITLE_LENGTH = 100;
// 楽天ブックスAPIのレートリミット（1秒1回）に合わせ、自動検索は1件ずつ間隔をあける（v2.2 §3.7）
const RAKUTEN_SEARCH_INTERVAL_MS = 1100;

type GameFilter = 'all' | 'guessed' | 'none';

/**
 * 新規のゲーム名の候補の、楽天ブックスの商品の決まり具合（v2.2 §3.7・§3.3）。推定ありの候補は 'not_new'。
 * queued: 自動検索の順番待ち（検索中を含む）／ unconfirmed: 検索後にゲーム名を変えた・検索に失敗した（承認APIが名前で探す）
 */
type RakutenState = 'not_new' | 'matched' | 'unmatched' | 'none' | 'queued' | 'unconfirmed';
type RakutenFilter = 'all' | Exclude<RakutenState, 'not_new'>;

const RAKUTEN_FILTER_LABEL: Record<RakutenFilter, string> = {
  all: 'すべて',
  matched: '商品あり',
  unmatched: '一致なし（候補あり）',
  none: '楽天なし・見つからない',
  queued: '自動検索の順番待ち',
  unconfirmed: '要確認（名前変更・検索失敗）',
};

const APPROVE_ERROR_LABEL: Record<string, string> = {
  not_public: 'YouTubeで非公開になっていたため却下しました',
  playlist_not_found: 'YouTubeで削除されていたため却下しました',
  game_not_found: 'ゲームタイトルが見つかりません',
  youtube_api_error: 'YouTube APIの呼び出しに失敗しました',
  channel_not_found: 'チャンネル情報を取得できませんでした',
  not_pending: '既に処理済みです',
  register_failed: '登録に失敗しました',
  game_create_failed: 'ゲームタイトルの登録に失敗しました',
};

/** 承認APIの rakutenJan。まだ検索していない候補は送らず、承認APIに名前の完全一致で探させる */
function rakutenJanParam(pick: RakutenPick | null | undefined): { rakutenJan?: string | null } {
  return pick === undefined ? {} : { rakutenJan: pick?.jan ?? null };
}

const STATUS_TABS: Array<{ value: CandidateStatus; label: string }> = [
  { value: 'pending', label: '未処理' },
  { value: 'registered', label: '登録済み' },
  { value: 'rejected', label: '却下済み' },
];

export default function AdminCollectionPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<CandidateStatus>('pending');
  const [candidates, setCandidates] = useState<CollectionCandidate[] | null>(null);
  const [games, setGames] = useState<GameOption[]>([]);
  const [tagsMap, setTagsMap] = useState<Map<string, TagInfo>>(new Map());
  const [channels, setChannels] = useState<Map<string, ExplorationChannel>>(new Map());
  const [lastBatch, setLastBatch] = useState<CollectionBatchLog | null>(null);
  const [quotaUsed, setQuotaUsed] = useState<number | null>(null);

  const [channelFilter, setChannelFilter] = useState('all');
  const [gameFilter, setGameFilter] = useState<GameFilter>('all');
  const [rakutenFilter, setRakutenFilter] = useState<RakutenFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gameOverrides, setGameOverrides] = useState<Map<string, GameOption>>(new Map());
  // 推定なしの候補で、承認時に用意するゲーム名を書き換えたもの（既定は候補の gameQuery）
  const [newGameTitles, setNewGameTitles] = useState<Map<string, string>>(new Map());
  const [removedTags, setRemovedTags] = useState<Map<string, Set<string>>>(new Map());
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // 楽天ブックスの検索結果（候補に保存済みのものより新しい分）と、行ごとに選び直した商品（null は楽天なし）
  const [rakutenResults, setRakutenResults] = useState<Map<string, RakutenSearchResult>>(new Map());
  const [rakutenChoices, setRakutenChoices] = useState<Map<string, RakutenPick | null>>(new Map());
  const [rakutenSearching, setRakutenSearching] = useState<Set<string>>(new Set());
  const [rakutenFailed, setRakutenFailed] = useState<Set<string>>(new Set());
  const [rakutenPickFor, setRakutenPickFor] = useState<CollectionCandidate | null>(null);
  const [videosFor, setVideosFor] = useState<CollectionCandidate | null>(null);
  const rakutenQueueRunningRef = useRef(false);
  const [rakutenQueueTick, setRakutenQueueTick] = useState(0);

  const [gameSelectFor, setGameSelectFor] = useState<CollectionCandidate | null>(null);
  const [gameCreateFor, setGameCreateFor] = useState<CollectionCandidate | null>(null);
  const [exploring, setExploring] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [rejecting, setRejecting] = useState(false);

  // タブを素早く切り替えたとき、前のタブの読み込み結果で上書きしないよう最新の要求だけを反映する
  const latestStatusRef = useRef<CandidateStatus>('pending');

  async function loadCandidates(next: CandidateStatus) {
    latestStatusRef.current = next;
    const list = await fetchCandidates(next);
    if (latestStatusRef.current === next) setCandidates(list);
  }

  async function loadMeta() {
    const [channelList, batch, used] = await Promise.all([fetchExplorationChannels(), fetchLastCollectionBatch(), fetchCollectionQuotaUsedToday()]);
    setChannels(new Map(channelList.map((c) => [c.id, c])));
    setLastBatch(batch);
    setQuotaUsed(used);
  }

  useEffect(() => {
    // 非同期 IIFE にして、effect 本体で同期的に setState しない形にする（react-hooks/set-state-in-effect）
    (async () => {
      const [gamesSnap, map] = await Promise.all([getDocs(collection(db, 'games')), fetchTagsMap(), loadMeta(), loadCandidates('pending')]);
      setGames(
        gamesSnap.docs
          .map((d) => ({ id: d.id, title: (d.data().title as string) ?? '', packageImageUrl: (d.data().packageImageUrl as string) ?? null }))
          .sort((a, b) => a.title.localeCompare(b.title, 'ja')),
      );
      setTagsMap(map);
    })();
  }, []);

  function changeStatus(next: CandidateStatus) {
    setStatus(next);
    setSelected(new Set());
    setRowErrors(new Map());
    setCandidates(null);
    loadCandidates(next);
  }

  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  function gameFor(c: CollectionCandidate): GameOption | null {
    return gameOverrides.get(c.id) ?? (c.guessedGameId ? gamesById.get(c.guessedGameId) : undefined) ?? guessGame(c.playlistTitle, games);
  }

  /** 推定なしの候補で、承認時に用意するゲーム名（照合・新規登録に使えない名前なら null） */
  function newGameTitleFor(c: CollectionCandidate): string | null {
    const title = (newGameTitles.get(c.id) ?? c.gameQuery).trim();
    return title && title.length <= MAX_GAME_TITLE_LENGTH && normalizeForMatch(title) ? title : null;
  }

  function rakutenResultFor(c: CollectionCandidate): RakutenSearchResult | null {
    return rakutenResults.get(c.id) ?? c.rakutenSearch;
  }

  /**
   * 新規のゲームに結び付ける楽天ブックスの商品。選び直したものがあればそれ、無ければ検索結果のうちゲーム名と
   * 一致する商品（承認APIの完全一致と同じ正規化）。null は楽天なし、undefined はまだ検索していない（承認APIが探す）
   */
  function rakutenPickOf(c: CollectionCandidate): RakutenPick | null | undefined {
    if (rakutenChoices.has(c.id)) return rakutenChoices.get(c.id)!;
    const result = rakutenResultFor(c);
    // ゲーム名を書き換えた後の古い結果は使わず、未検索と同じく承認APIに新しい名前で探させる
    if (!result || rakutenResultStale(c)) return undefined;
    const key = normalizeForMatch(newGameTitleFor(c) ?? '');
    return result.items.find((item) => key && normalizeForMatch(normalizeRakutenGameTitle(item.title)) === key) ?? null;
  }

  /** 検索した後にゲーム名を書き換えたか */
  function rakutenResultStale(c: CollectionCandidate): boolean {
    const result = rakutenResultFor(c);
    return !!result && normalizeForMatch(result.title) !== normalizeForMatch(newGameTitleFor(c) ?? '');
  }

  /** ゲーム名 title の候補として楽天ブックスを検索する。query を渡すとその語で検索する（モーダルの探し直し） */
  async function searchRakuten(c: CollectionCandidate, title: string, query?: string): Promise<boolean> {
    setRakutenSearching((prev) => new Set(prev).add(c.id));
    try {
      const res = await postAdminApi<Partial<RakutenSearchResult>>('/api/admin/collection/candidates', { action: 'rakuten_search', playlistId: c.id, title, query });
      if (!res.ok || !Array.isArray(res.body.items)) throw new Error('rakuten_search_failed');
      const result: RakutenSearchResult = { title, query: res.body.query ?? title, items: res.body.items };
      setRakutenResults((prev) => new Map(prev).set(c.id, result));
      setRakutenFailed((prev) => {
        const next = new Set(prev);
        next.delete(c.id);
        return next;
      });
      return true;
    } catch {
      setRakutenFailed((prev) => new Set(prev).add(c.id));
      return false;
    } finally {
      setRakutenSearching((prev) => {
        const next = new Set(prev);
        next.delete(c.id);
        return next;
      });
    }
  }

  function chooseRakuten(candidateId: string, pick: RakutenPick | null) {
    setRakutenChoices((prev) => new Map(prev).set(candidateId, pick));
  }

  function tagIdsFor(c: CollectionCandidate): string[] {
    const channelTags = channels.get(c.explorationChannelId)?.tagIds ?? [];
    const removed = removedTags.get(c.id);
    return [...new Set([...channelTags, ...c.titleTagIds])].filter((id) => tagsMap.has(id) && !removed?.has(id));
  }

  function hasGameOf(c: CollectionCandidate): boolean {
    return !!(gameOverrides.get(c.id) ?? (c.guessedGameId && gamesById.get(c.guessedGameId)) ?? guessGame(c.playlistTitle, games));
  }

  function rakutenStateOf(c: CollectionCandidate): RakutenState {
    if (hasGameOf(c) || !newGameTitleFor(c)) return 'not_new';
    const pick = rakutenPickOf(c);
    if (pick) return 'matched';
    if (pick === null) {
      const result = rakutenResultFor(c);
      return !rakutenChoices.has(c.id) && result && result.items.length > 0 ? 'unmatched' : 'none';
    }
    return rakutenResultStale(c) || rakutenFailed.has(c.id) ? 'unconfirmed' : 'queued';
  }

  // 絞り込み。各絞り込みの件数は、ほかの絞り込みを当てた件数を出す（v2.2 §3.3）。
  // 楽天の状態は描画ごとに変わるので memo にはしない（候補は数百件なので毎回数えても軽い）
  const matchesChannel = (c: CollectionCandidate) => channelFilter === 'all' || c.explorationChannelId === channelFilter;
  const matchesGame = (c: CollectionCandidate) => gameFilter === 'all' || (gameFilter === 'guessed') === hasGameOf(c);
  const matchesRakuten = (c: CollectionCandidate) => rakutenFilter === 'all' || rakutenStateOf(c) === rakutenFilter;
  const allCandidates = candidates ?? [];
  const filtered = allCandidates.filter((c) => matchesChannel(c) && (status !== 'pending' || (matchesGame(c) && matchesRakuten(c))));
  const gameFilterCounts = (() => {
    const base = allCandidates.filter((c) => matchesChannel(c) && matchesRakuten(c));
    const guessed = base.filter(hasGameOf).length;
    return { all: base.length, guessed, none: base.length - guessed };
  })();
  const rakutenFilterCounts = (() => {
    const counts: Record<RakutenFilter, number> = { all: 0, matched: 0, unmatched: 0, none: 0, queued: 0, unconfirmed: 0 };
    for (const c of allCandidates) {
      if (!matchesChannel(c) || !matchesGame(c)) continue;
      counts.all++;
      const state = rakutenStateOf(c);
      if (state !== 'not_new') counts[state]++;
    }
    return counts;
  })();

  // チャンネルごとにまとめる（並びはチャンネル名順、チャンネル内は再生リストの作成日時の新しい順）
  const groups = (() => {
    const map = new Map<string, { key: string; title: string; items: CollectionCandidate[] }>();
    for (const c of filtered) {
      const group = map.get(c.explorationChannelId) ?? { key: c.explorationChannelId, title: c.channelTitle, items: [] };
      group.items.push(c);
      map.set(c.explorationChannelId, group);
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'ja'));
  })();

  // 新規のゲーム名の候補を、表示順に1件ずつ楽天ブックスで検索する（v2.2 §3.7）。検索済み（候補に保存済み）・
  // 失敗したものは飛ばす。承認中・モーダルで探し直している間は止める（楽天APIの1秒1回を画面全体で守るため）。1件終わるごとに状態が変わり、この effect が次の1件を拾う
  const nextRakutenTarget =
    status === 'pending' && progress === null && rakutenPickFor === null
      ? groups.flatMap((g) => g.items).find((c) => !gameFor(c) && newGameTitleFor(c) && !rakutenResultFor(c) && !rakutenFailed.has(c.id) && !rakutenSearching.has(c.id))
      : undefined;
  const nextRakutenTitle = nextRakutenTarget ? newGameTitleFor(nextRakutenTarget) : null;
  useEffect(() => {
    if (!nextRakutenTarget || !nextRakutenTitle || rakutenQueueRunningRef.current) return;
    rakutenQueueRunningRef.current = true;
    (async () => {
      await searchRakuten(nextRakutenTarget, nextRakutenTitle);
      await new Promise((resolve) => setTimeout(resolve, RAKUTEN_SEARCH_INTERVAL_MS));
      rakutenQueueRunningRef.current = false;
      // 待っている間に状態が変わらなかったときも次の1件を拾えるよう、待ち終わりで1回描画し直す
      setRakutenQueueTick((t) => t + 1);
    })();
    // searchRakuten は描画ごとに作り直されるが、対象が変わったときだけ動かせばよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextRakutenTarget?.id, nextRakutenTitle, rakutenQueueTick]);

  const channelOptions = useMemo(() => {
    const seen = new Map<string, { title: string; count: number }>();
    candidates?.forEach((c) => {
      const entry = seen.get(c.explorationChannelId) ?? { title: c.channelTitle, count: 0 };
      entry.count++;
      seen.set(c.explorationChannelId, entry);
    });
    return [
      { value: 'all', label: `すべてのチャンネル（${candidates?.length ?? 0}）` },
      ...[...seen.entries()]
        .sort((a, b) => a[1].title.localeCompare(b[1].title, 'ja'))
        .map(([value, { title, count }]) => ({ value, label: `${title}（${count}）` })),
    ];
  }, [candidates]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** 承認できる（＝ゲームが決まっているか、用意するゲーム名がある）候補のみ。却下済みタブでは全件 */
  function selectable(c: CollectionCandidate): boolean {
    return status === 'rejected' || (status === 'pending' && (!!gameFor(c) || !!newGameTitleFor(c)));
  }

  function changeNewGameTitle(c: CollectionCandidate, title: string) {
    setNewGameTitles((prev) => new Map(prev).set(c.id, title));
    const valid = title.trim() && title.trim().length <= MAX_GAME_TITLE_LENGTH && normalizeForMatch(title);
    if (!valid) {
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(c.id);
        return next;
      });
    }
  }

  function toggleGroup(items: CollectionCandidate[]) {
    const ids = items.filter(selectable).map((c) => c.id);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  function removeTag(candidateId: string, tagId: string) {
    setRemovedTags((prev) => {
      const next = new Map(prev);
      next.set(candidateId, new Set([...(prev.get(candidateId) ?? []), tagId]));
      return next;
    });
  }

  function setGame(candidateId: string, game: GameOption) {
    setGameOverrides((prev) => new Map(prev).set(candidateId, game));
    setSelected((prev) => new Set(prev).add(candidateId));
  }

  async function handleExplore() {
    setExploring(true);
    try {
      const res = await postAdminApi('/api/admin/collection/explore', {});
      if (res.status === 429) {
        toast({ type: 'error', message: quotaExceededMessage(res.body.remaining) });
      } else if (!res.ok) {
        toast({ type: 'error', message: '探索に失敗しました' });
      } else {
        toast({ type: 'success', message: `チャンネル${res.body.processedChannels}件を探索し、新しい候補を${res.body.candidatesFound}件追加しました` });
      }
      await Promise.all([loadMeta(), status === 'pending' ? loadCandidates('pending') : Promise.resolve()]);
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setExploring(false);
    }
  }

  async function handleApprove() {
    const targets = (candidates ?? []).filter((c) => selected.has(c.id) && (gameFor(c) || newGameTitleFor(c)));
    if (targets.length === 0) return;
    // 同じ名前は1件にまとめる（承認APIも最初の1件の楽天の商品で登録する）。楽天の商品か「楽天なし」を添える
    const newGameNameByKey = new Map<string, string>();
    for (const c of targets) {
      const title = newGameTitleFor(c);
      if (gameFor(c) || !title || newGameNameByKey.has(normalizeForMatch(title))) continue;
      const pick = rakutenPickOf(c);
      newGameNameByKey.set(normalizeForMatch(title), `${title}${pick ? `（楽天: ${pick.title}）` : pick === null ? '（楽天なし）' : ''}`);
    }
    const newGameNames = [...newGameNameByKey.values()];
    const NAMES_SHOWN = 10;
    const newGameNotice =
      newGameNames.length > 0
        ? `\n\n次のゲーム名は、同じ名前のゲームタイトルが無ければ新しく登録します（${newGameNames.length}件）:\n${newGameNames
            .slice(0, NAMES_SHOWN)
            .map((n) => `・${n}`)
            .join('\n')}${newGameNames.length > NAMES_SHOWN ? `\nほか${newGameNames.length - NAMES_SHOWN}件` : ''}\n\n`
        : '';
    // 楽天の商品がまだ決まっていない（順番待ち・名前変更・検索失敗）候補は、承認APIが名前の完全一致で探す
    const undecided = targets.filter((c) => ['queued', 'unconfirmed'].includes(rakutenStateOf(c))).length;
    const undecidedNotice =
      undecided > 0 ? `楽天の商品がまだ決まっていない候補が${undecided}件あります（自動検索の順番待ちなど。承認時に名前が完全一致する商品だけを探します）。\n\n` : '';
    if (!window.confirm(`${targets.length}件を登録します。${newGameNotice}${undecidedNotice}よろしいですか？`)) return;

    setProgress({ done: 0, total: targets.length });
    // 自動検索の1件（と、その後の間隔）が終わるのを待ってから送る。承認APIも楽天ブックスを呼ぶため（1秒1回）
    for (let waited = 0; rakutenQueueRunningRef.current && waited < 15_000; waited += 200) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // 件数で区切りつつ、新しいゲーム名を含む候補は APPROVE_CHUNK_NEW_GAMES 件までにする
    const chunks: CollectionCandidate[][] = [];
    let current: CollectionCandidate[] = [];
    let currentNew = 0;
    for (const c of targets) {
      const isNew = !gameFor(c);
      if (current.length >= APPROVE_CHUNK || (isNew && currentNew >= APPROVE_CHUNK_NEW_GAMES)) {
        chunks.push(current);
        current = [];
        currentNew = 0;
      }
      current.push(c);
      if (isNew) currentNew++;
    }
    if (current.length > 0) chunks.push(current);

    const errors = new Map<string, string>();
    let okCount = 0;
    let stopped = false;
    const createdGames: GameOption[] = [];
    try {
      let done = 0;
      for (const chunk of chunks) {
        const res = await postAdminApi<{
          results?: Array<{ playlistId: string; ok: boolean; error?: string; createdGame?: { id: string; title: string } }>;
          error?: string;
          remaining?: number;
        }>('/api/admin/collection/candidates', {
          action: 'approve',
          items: chunk.map((c) => {
            const game = gameFor(c);
            return game
              ? { playlistId: c.id, gameId: game.id, tagIds: tagIdsFor(c) }
              : { playlistId: c.id, newGameTitle: newGameTitleFor(c), ...rakutenJanParam(rakutenPickOf(c)), tagIds: tagIdsFor(c) };
          }),
        });
        if (res.status === 429) {
          toast({ type: 'error', message: quotaExceededMessage(res.body.remaining) });
          stopped = true;
          break;
        }
        if (!res.ok || !res.body.results) {
          toast({ type: 'error', message: '登録に失敗しました' });
          stopped = true;
          break;
        }
        for (const r of res.body.results) {
          if (r.createdGame) createdGames.push({ id: r.createdGame.id, title: r.createdGame.title, packageImageUrl: null });
          if (r.ok) okCount++;
          else errors.set(r.playlistId, APPROVE_ERROR_LABEL[r.error ?? ''] ?? '登録に失敗しました');
        }
        done += chunk.length;
        setProgress({ done, total: targets.length });
      }
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
      stopped = true;
    }
    if (createdGames.length > 0) {
      // 登録したゲームは、残りの候補の推定にもすぐ使う
      setGames((prev) => [...prev, ...createdGames].sort((a, b) => a.title.localeCompare(b.title, 'ja')));
    }
    if (!stopped || okCount > 0) {
      const created = createdGames.length > 0 ? `、ゲームタイトルを${createdGames.length}件追加` : '';
      toast({
        type: errors.size > 0 ? 'error' : 'success',
        message: `${okCount}件を登録しました${created}${errors.size > 0 ? `（失敗 ${errors.size}件）` : ''}`,
      });
    }
    setRowErrors(errors);
    setSelected(new Set([...errors.keys()].filter((id) => selected.has(id))));
    setProgress(null);
    await Promise.all([loadCandidates('pending'), loadMeta()]);
  }

  async function handleStatusChange(action: 'reject' | 'restore') {
    const ids = [...selected];
    if (ids.length === 0) return;
    const label = action === 'reject' ? '却下' : '未処理に戻す';
    if (!window.confirm(`${ids.length}件を${label}します。よろしいですか？`)) return;
    setRejecting(true);
    try {
      const res = await postAdminApi('/api/admin/collection/candidates', { action, playlistIds: ids });
      if (!res.ok) {
        toast({ type: 'error', message: `${label}に失敗しました` });
      } else {
        toast({ type: 'success', message: `${res.body.updated}件を${label}しました` });
        setSelected(new Set());
        await loadCandidates(status);
      }
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setRejecting(false);
    }
  }

  const busy = exploring || progress !== null || rejecting;

  return (
    <div className="flex flex-col gap-5 pb-24">
      <SectionHeading>コンテンツ収集</SectionHeading>
      <CollectionNav />

      {/* 状態の表示と、探索の操作を別のカードに分ける（v2.2 §3.1） */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <h2 className="text-base font-medium text-text-primary">収集の状況</h2>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-md">
            <dt className="text-text-tertiary">最終探索</dt>
            <dd className="text-text-secondary">
              {lastBatch
                ? `${formatDateTime(lastBatch.executedAt)}（${lastBatch.trigger === 'cron' ? '週1自動' : '手動'}、${
                    lastBatch.status === 'skipped' ? 'APIの枠不足でスキップ' : `新規候補 ${lastBatch.candidatesFound}件${lastBatch.status === 'success' ? '' : '、一部エラーあり'}`
                  }）`
                : 'まだありません'}
            </dd>
            <dt className="text-text-tertiary">本日のAPI消費</dt>
            <dd className="text-text-secondary">
              {quotaUsed ?? '-'} / {COLLECTION_DAILY_QUOTA_LIMIT.toLocaleString('ja-JP')} ユニット（YouTube API のうちコンテンツ収集の分）
            </dd>
          </dl>
        </Card>
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-medium text-text-primary">探索を実行</h2>
            <Button variant="secondary" onClick={handleExplore} loading={exploring} disabled={busy}>
              探索を実行
            </Button>
          </div>
          <ul className="list-disc pl-5 text-sm text-text-tertiary">
            <li>探索対象チャンネル（探索中）すべての再生リストを YouTube から読みます</li>
            <li>動画10本以上・公開・除外語（切り抜き等）なし・まだ登録も候補化もしていないものを、新しい候補として下に追加します</li>
            <li>既にある候補は、本数だけ今の数に更新します</li>
            <li>本番では毎週月曜5時にも自動で実行します</li>
          </ul>
        </Card>
      </div>

      <Tabs value={status} onValueChange={(v) => changeStatus(v as CandidateStatus)}>
        <TabsList aria-label="状態で絞り込み">
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} count={t.value === status && candidates ? candidates.length : undefined}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap gap-2">
        <SelectMenu value={channelFilter} onValueChange={setChannelFilter} options={channelOptions} aria-label="チャンネルで絞り込み" />
        {status === 'pending' && (
          <SelectMenu<GameFilter>
            value={gameFilter}
            onValueChange={setGameFilter}
            prefix="ゲーム:"
            aria-label="ゲームで絞り込み"
            options={[
              { value: 'all', label: `すべて（${gameFilterCounts.all}）` },
              { value: 'guessed', label: `登録済みのゲームに付ける（${gameFilterCounts.guessed}）` },
              { value: 'none', label: `新しく登録する（${gameFilterCounts.none}）` },
            ]}
          />
        )}
        {status === 'pending' && (
          <SelectMenu<RakutenFilter>
            value={rakutenFilter}
            onValueChange={setRakutenFilter}
            prefix="楽天:"
            aria-label="楽天の商品で絞り込み"
            options={(Object.keys(RAKUTEN_FILTER_LABEL) as RakutenFilter[]).map((value) => ({
              value,
              label: `${RAKUTEN_FILTER_LABEL[value]}（${rakutenFilterCounts[value]}）`,
            }))}
          />
        )}
      </div>

      {status === 'pending' && (
        <p className="text-md text-text-tertiary">
          ゲームが推定できなかった候補（「新しく登録する」）は、「登録するゲームタイトル名」の欄の名前でゲームタイトルを登録してから承認します（同じ名前のゲームタイトルがあればそれを使い、楽天ブックスで見つかれば画像なども入れます）。ゲームではない再生リストはチェックを外すか却下してください。
        </p>
      )}

      {candidates === null ? (
        <Card>
          <SkeletonText lines={5} />
        </Card>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<InventoryIcon />}
          title="候補はありません"
          description={status === 'pending' ? '探索対象チャンネルを登録して「探索を実行」すると、ここに候補が並びます' : undefined}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => {
            const selectableIds = group.items.filter(selectable).map((c) => c.id);
            const allOn = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
            const isCollapsed = collapsed.has(group.key);
            return (
              // 管理画面は操作ミスを防ぐことを優先し、チャンネルごとに枠で囲んで、どのカードがどのチャンネルか分かるようにする
              <section key={group.key} className="overflow-hidden rounded-[12px] border border-admin-border">
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
                    {channels.get(group.key)?.channelIconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={channels.get(group.key)!.channelIconUrl!} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span aria-hidden className="size-9 shrink-0 rounded-full bg-bg-hover" />
                    )}
                    <span className="min-w-0">
                      {group.title}
                      <span className="ml-1 text-md font-normal text-text-tertiary">（{group.items.length}件）</span>
                    </span>
                  </button>
                  {status !== 'registered' && (
                    <label className="inline-flex items-center gap-2 text-md text-text-tertiary">
                      <input type="checkbox" className="size-4" checked={allOn} disabled={selectableIds.length === 0 || busy} onChange={() => toggleGroup(group.items)} />
                      全選択
                    </label>
                  )}
                </div>

                {!isCollapsed && (
                  <ul className="flex flex-col gap-2 bg-bg-base/40 p-3">
                    {group.items.map((c) => {
                      const game = gameFor(c);
                      const tagIds = tagIdsFor(c);
                      const canSelect = selectable(c);
                      const error = rowErrors.get(c.id);
                      return (
                        <li key={c.id}>
                          {/* PCは左に再生リスト、右にゲーム（楽天のパッケージ）を並べる。スマホは縦に積む（v2.2 §3.4） */}
                          <Card className={cn('flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-6', selected.has(c.id) && 'border-border-active')}>
                            <div className="flex min-w-0 gap-3">
                              {status !== 'registered' && (
                                <input
                                  type="checkbox"
                                  className="mt-1 size-4 shrink-0"
                                  aria-label={`${c.playlistTitle}を選択`}
                                  checked={selected.has(c.id)}
                                  disabled={!canSelect || busy}
                                  onChange={() => toggleSelected(c.id)}
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => setVideosFor(c)}
                                className="relative aspect-video w-28 shrink-0 self-start overflow-hidden rounded-[6px] bg-bg-hover md:w-44"
                                aria-label={`${c.playlistTitle}の再生リストを確認`}
                              >
                                {c.thumbnailUrl && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={c.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                                )}
                              </button>
                              <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <p className="text-base text-text-primary">{c.playlistTitle}</p>
                                <p className="text-md text-text-tertiary">
                                  {c.videoCount}本（{formatDateTime(c.videoCountCheckedAt)} の探索時点）
                                </p>
                                <p className="text-md text-text-tertiary">再生リスト作成日 {formatDateTime(c.playlistPublishedAt)}</p>
                                <div>
                                  <AdminActionButton onClick={() => setVideosFor(c)} aria-label={`${c.playlistTitle}の動画一覧を見る`}>
                                    動画一覧を見る
                                  </AdminActionButton>
                                </div>
                                {status !== 'pending' && c.reviewComment && (
                                  <p className="text-md text-text-muted">理由: {APPROVE_ERROR_LABEL[c.reviewComment] ?? c.reviewComment}</p>
                                )}
                                {status === 'registered' && (
                                  <Link href={`/playlists/${c.id}`} className="text-md text-text-tertiary hover:text-text-primary">
                                    登録した再生リストを見る
                                  </Link>
                                )}
                                {status === 'pending' && tagIds.length > 0 && (
                                  <div className="mt-1 flex flex-col gap-1">
                                    <p className="text-sm text-text-tertiary">承認時に付けるタグ（×で外せる）</p>
                                    <div className="flex flex-wrap gap-1">
                                      {tagIds.map((id) => (
                                        <span key={id} className="inline-flex items-center gap-1 rounded-[4px] bg-bg-hover px-2 py-[2px] text-sm text-text-secondary">
                                          {tagsMap.get(id)?.name}
                                          <button
                                            type="button"
                                            aria-label={`${tagsMap.get(id)?.name}を外す`}
                                            onClick={() => removeTag(c.id, id)}
                                            className="text-text-muted hover:text-text-primary"
                                            disabled={busy}
                                          >
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

                            {status === 'pending' && (
                              <div className="flex min-w-0 flex-col gap-3 rounded-[8px] border border-surface-border bg-bg-base/40 p-3">
                                <p className="flex flex-wrap items-center gap-2 text-md">
                                  <span className="text-text-tertiary">ゲーム:</span>
                                  {game ? (
                                    <StatusBadge>登録済みのゲームに付ける</StatusBadge>
                                  ) : (
                                    <StatusBadge>新しく登録する</StatusBadge>
                                  )}
                                </p>
                                {game ? (
                                  <div className="flex items-start gap-3">
                                    <PackageImage url={game.packageImageUrl} />
                                    <div className="flex min-w-0 flex-col items-start gap-2">
                                      <p className="text-base text-text-primary">{game.title}</p>
                                      <AdminActionButton onClick={() => setGameSelectFor(c)} disabled={busy} aria-label={`${c.playlistTitle}のゲームを選び直す`}>
                                        別のゲームを選ぶ
                                      </AdminActionButton>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex flex-col gap-1">
                                      <label htmlFor={`new-game-${c.id}`} className="text-sm text-text-secondary">
                                        登録するゲームタイトル名（初期値は再生リスト名から推定）
                                      </label>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Input
                                          id={`new-game-${c.id}`}
                                          aria-label={`${c.playlistTitle}のゲーム名`}
                                          value={newGameTitles.get(c.id) ?? c.gameQuery}
                                          maxLength={MAX_GAME_TITLE_LENGTH}
                                          onChange={(e) => changeNewGameTitle(c, e.target.value)}
                                          disabled={busy}
                                          className="min-w-0 flex-1 basis-56"
                                        />
                                        <AdminActionButton onClick={() => setGameSelectFor(c)} disabled={busy} aria-label={`${c.playlistTitle}のゲームを既存から選ぶ`}>
                                          既存のゲームから選ぶ
                                        </AdminActionButton>
                                      </div>
                                    </div>
                                    {newGameTitleFor(c) && (
                                      <RakutenLine
                                        pick={rakutenPickOf(c)}
                                        explicit={rakutenChoices.has(c.id)}
                                        stale={rakutenResultStale(c)}
                                        result={rakutenResultFor(c)}
                                        searching={rakutenSearching.has(c.id)}
                                        failed={rakutenFailed.has(c.id)}
                                        gameTitle={newGameTitleFor(c)!}
                                        disabled={busy}
                                        onOpen={() => setRakutenPickFor(c)}
                                        onUseName={(name) => changeNewGameTitle(c, name)}
                                      />
                                    )}
                                  </>
                                )}
                              </div>
                            )}
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

      {status !== 'registered' && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-surface-border bg-bg-base/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
            <p className="text-base text-text-secondary">
              {progress ? `登録中… ${progress.done} / ${progress.total} 件` : `選択中 ${selected.size}件`}
            </p>
            <div className="flex gap-2">
              {status === 'pending' ? (
                <>
                  <Button variant="ghost" onClick={() => handleStatusChange('reject')} disabled={selected.size === 0 || busy} loading={rejecting}>
                    選択を却下
                  </Button>
                  <Button variant="primary" onClick={handleApprove} disabled={selected.size === 0 || busy} loading={progress !== null}>
                    選択を承認して登録
                  </Button>
                </>
              ) : (
                <Button variant="secondary" onClick={() => handleStatusChange('restore')} disabled={selected.size === 0 || busy} loading={rejecting}>
                  選択を未処理に戻す
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <GameSelectModal
        open={gameSelectFor !== null}
        onOpenChange={(open) => !open && setGameSelectFor(null)}
        games={games}
        onSelect={(g) => {
          if (gameSelectFor) setGame(gameSelectFor.id, g);
          setGameSelectFor(null);
        }}
        onAddNew={() => {
          setGameCreateFor(gameSelectFor);
          setGameSelectFor(null);
        }}
      />
      <PlaylistVideosModal candidate={videosFor} onClose={() => setVideosFor(null)} />
      <RakutenPickModal
        open={rakutenPickFor !== null}
        onOpenChange={(open) => !open && setRakutenPickFor(null)}
        gameTitle={rakutenPickFor ? (newGameTitleFor(rakutenPickFor) ?? '') : ''}
        result={rakutenPickFor ? rakutenResultFor(rakutenPickFor) : null}
        selectedJan={rakutenPickFor ? (rakutenPickOf(rakutenPickFor)?.jan ?? null) : null}
        onSearch={(q) => (rakutenPickFor ? searchRakuten(rakutenPickFor, newGameTitleFor(rakutenPickFor) ?? q, q) : Promise.resolve(false))}
        onPick={(item) => {
          if (rakutenPickFor) chooseRakuten(rakutenPickFor.id, item);
          setRakutenPickFor(null);
        }}
        onNone={() => {
          if (rakutenPickFor) chooseRakuten(rakutenPickFor.id, null);
          setRakutenPickFor(null);
        }}
      />
      <GameCreateModal
        open={gameCreateFor !== null}
        onOpenChange={(open) => !open && setGameCreateFor(null)}
        initialQuery={gameCreateFor?.gameQuery}
        onCreated={(g) => {
          setGames((prev) => [...prev, g].sort((a, b) => a.title.localeCompare(b.title, 'ja')));
          if (gameCreateFor) setGame(gameCreateFor.id, g);
          setGameCreateFor(null);
        }}
      />
    </div>
  );
}

/** 新規のゲームに結び付ける楽天ブックスの商品の行（v2.2 §3.7） */
function RakutenLine({
  pick,
  explicit,
  stale,
  result,
  searching,
  failed,
  gameTitle,
  disabled,
  onOpen,
  onUseName,
}: {
  pick: RakutenPick | null | undefined;
  explicit: boolean;
  stale: boolean;
  result: RakutenSearchResult | null;
  searching: boolean;
  failed: boolean;
  gameTitle: string;
  disabled: boolean;
  onOpen: () => void;
  onUseName: (name: string) => void;
}) {
  const pickName = pick ? normalizeRakutenGameTitle(pick.title) : '';
  let body: ReactNode;
  let action = '候補から選ぶ';
  if (searching) {
    body = <span className="text-text-tertiary">検索中…</span>;
  } else if (pick) {
    action = '選び直す';
    body = (
      <span className="line-clamp-3 text-text-primary">
        {pick.title}
        {pick.hardware && <span className="text-text-tertiary">（{pick.hardware}）</span>}
      </span>
    );
  } else if (failed && !result) {
    action = '探し直す';
    body = <span className="text-text-tertiary">検索に失敗しました</span>;
  } else if (pick === undefined && stale) {
    action = '探し直す';
    body = <span className="text-text-tertiary">ゲーム名を変えました（承認時にこの名前で探します）</span>;
  } else if (pick === undefined) {
    body = <span className="text-text-tertiary">自動検索の順番待ち</span>;
  } else if (explicit) {
    body = <span className="text-text-tertiary">使わない（名前だけで登録）</span>;
  } else if (result && result.items.length > 0) {
    body = <span className="text-text-tertiary">名前が一致する商品なし（候補{result.items.length}件。このままなら名前だけで登録）</span>;
  } else {
    action = '探し直す';
    body = <span className="text-text-tertiary">見つかりませんでした（名前だけで登録）</span>;
  }
  return (
    <div className="flex items-start gap-3 text-md" data-testid="rakuten-line">
      <PackageImage url={pick?.imageUrl ?? null} />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <p className="text-sm text-text-tertiary">楽天ブックスの商品（パッケージ画像・機種・ジャンルを入れる）</p>
        <span aria-live="polite" className="min-w-0">
          {body}
        </span>
        <div className="flex flex-wrap gap-2">
          {/* 検索中も外さない（モーダルを閉じたときのフォーカスの戻り先にするため） */}
          {/* 「探し直す」（検索し直す操作）は、「候補から選ぶ」「選び直す」（結果から選ぶ操作）と色を分ける */}
          <Button
            variant={action === '探し直す' ? 'secondary' : 'rakuten'}
            size="sm"
            onClick={onOpen}
            disabled={disabled || searching}
            aria-label={`${gameTitle}の楽天の商品を${action}`}
          >
            {action === '探し直す' && <SearchIcon size={12} />}
            {action}
          </Button>
          {pick && pickName && normalizeForMatch(pickName) !== normalizeForMatch(gameTitle) && (
            <AdminActionButton onClick={() => onUseName(pickName)} disabled={disabled} aria-label={`ゲーム名を「${pickName}」にする`}>
              商品名をゲーム名にする
            </AdminActionButton>
          )}
        </div>
      </div>
    </div>
  );
}

/** ゲームのパッケージ画像（無ければ「画像なし」の枠）。楽天の商品・登録済みのゲームで共用 */
function PackageImage({ url }: { url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-[112px] w-[84px] shrink-0 rounded-[4px] bg-bg-hover object-cover" loading="lazy" />
  ) : (
    <span aria-hidden className="flex h-[112px] w-[84px] shrink-0 items-center justify-center rounded-[4px] border border-dashed border-surface-border text-xs text-text-muted">
      画像なし
    </span>
  );
}

/**
 * 管理画面の行の中の操作ボタン（ゲームを選ぶ等）。管理画面は操作ミスを防ぐのを優先し、ユーザー向け画面の
 * 白黒基調より目立つ管理用の色（admin-accent）で、押せる場所だと分かる見た目にする
 */
function AdminActionButton({ className, ...rest }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-[6px] border border-admin-accent bg-admin-accent/15 px-[10px] py-1 text-sm font-medium text-admin-accent-text',
        'transition-colors duration-[120ms] not-disabled:hover:bg-admin-accent/30 disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  );
}
