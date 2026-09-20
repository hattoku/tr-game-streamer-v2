/**
 * 視聴履歴（/history）。document/specification/page/ページ 視聴履歴 仕様書.md 準拠。
 * フェーズ4.5ステップ5でデザイン適用（HANDOFF.md参照）。土台（`watch_history`のスキーマ・ルール・
 * 複合インデックス`userId + watchedAt DESC`）はフェーズ2から既に揃っており、書き込みも動画プレーヤー
 * （app/(main)/playlists/[playlistId]/page.tsx）が既に行っているため、本ステップは一覧・検索・削除のみ実装する。
 *
 * - 左カラム: 日付グルーピング一覧（今日／昨日／それ以外は「YYYY年M月D日（曜）」）＋カード
 *   （サムネイル＋進捗バー・タイトル・配信者・⋮メニューからの個別削除）
 * - 右カラム: キーワード検索（動画タイトル・配信者名）・日付フィルター（この日付以前）・全件削除
 *   （モバイルは`/playlists`と同じアコーディオンパネルに収める）
 * - `watch_history`にはタイトル・サムネイル・配信者名が無いため、`videos`（{playlistId}_{youtubeVideoId}）・
 *   `playlists`（channelName/channelIconUrl は denormalized 済み）から合成する
 *
 * スコープ外・簡略化した点（HANDOFF.mdフェーズ4.5ステップ5で明記済み）:
 * - 未ログイン時のLocalStorage記録・ログイン時マージ（§7.2・§7.3）は見送り。動画プレーヤー側も
 *   ゲストの視聴進捗を保存しないため、未ログイン時は常に空状態を表示する
 * - カレンダーピッカーは依存追加を避け `<input type="date">` で代替（§5.2）
 * - キーワード検索のデバウンス（§5.1）は `/playlists`・`/games` と同じくクライアント内メモリ配列の
 *   フィルタのため実施しない
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card, SectionHeading } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ChevronDownIcon, ChevronUpIcon, HistoryIcon, SearchIcon, XIcon } from '@/components/ui/icons';
import { HistoryCard, type HistoryCardData } from '@/components/history/HistoryCard';

interface HistoryItem extends HistoryCardData {
  watchedAt: number;
}

const WEEKDAY_LABEL = ['日', '月', '火', '水', '木', '金', '土'];

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDayLabel(ms: number, now = Date.now()): string {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(ms) === dayKey(now)) return '今日';
  if (dayKey(ms) === dayKey(yesterday.getTime())) return '昨日';
  const d = new Date(ms);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAY_LABEL[d.getDay()]}）`;
}

function toDateInputValue(ms: number = Date.now()): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateFilterLabel(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

async function loadHistory(uid: string): Promise<HistoryItem[]> {
  const snapshot = await getDocs(query(collection(db, 'watch_history'), where('userId', '==', uid), orderBy('watchedAt', 'desc')));
  const raw = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      playlistId: data.playlistId as string,
      youtubeVideoId: data.youtubeVideoId as string,
      progressPercent: (data.progressPercent as number) ?? 0,
      watchedAt: data.watchedAt?.toMillis?.() ?? 0,
    };
  });

  const uniquePlaylistIds = [...new Set(raw.map((r) => r.playlistId))];
  const playlistDocs = await Promise.all(uniquePlaylistIds.map((pid) => getDoc(doc(db, 'playlists', pid))));
  const playlistMap = new Map<string, HistoryCardData['playlist']>();
  playlistDocs.forEach((snap, i) => {
    if (snap.exists()) {
      const data = snap.data();
      playlistMap.set(uniquePlaylistIds[i], { channelName: data.channelName, channelIconUrl: data.channelIconUrl });
    }
  });

  const videoDocs = await Promise.all(raw.map((r) => getDoc(doc(db, 'videos', `${r.playlistId}_${r.youtubeVideoId}`))));

  return raw.map((r, i): HistoryItem => {
    const videoSnap = videoDocs[i];
    return {
      id: r.id,
      playlistId: r.playlistId,
      progressPercent: r.progressPercent,
      watchedAt: r.watchedAt,
      video: videoSnap.exists() ? { title: videoSnap.data().title, thumbnailUrl: videoSnap.data().thumbnailUrl } : null,
      playlist: playlistMap.get(r.playlistId) ?? null,
    };
  });
}

export default function HistoryPage() {
  const { user, loading } = useAuth();
  const { toast } = useToast();

  const [entries, setEntries] = useState<HistoryItem[] | null>(null);
  const [keyword, setKeyword] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<HistoryItem | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // 未ログインはLocalStorage記録を実装していないため、常に空状態を描画する
    // （§2.1の簡略化。ファイル冒頭コメント参照）。entriesには触れず、描画側でuserの有無を見て分岐する
    if (loading || !user) return;
    const uid = user.uid;
    (async () => {
      try {
        setEntries(await loadHistory(uid));
      } catch (e) {
        console.error('視聴履歴の読み込みに失敗しました', e);
        setEntries([]);
        toast({ type: 'error', message: '視聴履歴の読み込みに失敗しました' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const dateBounds = useMemo(() => {
    if (!entries || entries.length === 0) return null;
    const min = Math.min(...entries.map((e) => e.watchedAt));
    return { min: toDateInputValue(min), max: toDateInputValue() };
  }, [entries]);

  const visible = useMemo(() => {
    if (!entries) return [];
    const kw = keyword.trim().toLowerCase();
    const beforeMs = dateFilter ? new Date(`${dateFilter}T23:59:59.999`).getTime() : null;
    return entries.filter((e) => {
      if (kw) {
        const title = e.video?.title?.toLowerCase() ?? '';
        const channel = e.playlist?.channelName?.toLowerCase() ?? '';
        if (!title.includes(kw) && !channel.includes(kw)) return false;
      }
      if (beforeMs != null && e.watchedAt > beforeMs) return false;
      return true;
    });
  }, [entries, keyword, dateFilter]);

  const groups = useMemo(() => {
    // 既に watchedAt 降順のため、Map への挿入順そのままでグループ順・グループ内順が仕様通りになる
    const map = new Map<string, { label: string; items: HistoryItem[] }>();
    for (const item of visible) {
      const key = dayKey(item.watchedAt);
      if (!map.has(key)) map.set(key, { label: formatDayLabel(item.watchedAt), items: [] });
      map.get(key)!.items.push(item);
    }
    return [...map.values()];
  }, [visible]);

  async function handleDeleteOne() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'watch_history', deleteTarget.id));
      setEntries((prev) => prev?.filter((e) => e.id !== deleteTarget.id) ?? prev);
      toast({ type: 'success', message: '視聴履歴を削除しました' });
      setDeleteTarget(null);
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAll() {
    if (!entries || entries.length === 0) return;
    setBusy(true);
    try {
      // writeBatch は 500 件まで（notifications の一括既読と同じ分割方式）
      for (let i = 0; i < entries.length; i += 450) {
        const batch = writeBatch(db);
        entries.slice(i, i + 450).forEach((e) => batch.delete(doc(db, 'watch_history', e.id)));
        await batch.commit();
      }
      setEntries([]);
      toast({ type: 'success', message: '視聴履歴をすべて削除しました' });
      setDeleteAllOpen(false);
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setBusy(false);
    }
  }

  // ログイン済みなら読み込み完了を待つ。未ログインはentriesが常にnullのまま（フェッチしないため）
  // 空状態として扱う
  if (loading || (user && entries === null)) {
    return <HistorySkeleton />;
  }
  const historyEntries = entries ?? [];

  const activeFilterCount = (keyword.trim() ? 1 : 0) + (dateFilter ? 1 : 0);

  const controlPanel = (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input
          type="text"
          placeholder="動画タイトルや配信者名で検索"
          aria-label="動画タイトルや配信者名で検索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="pl-9 pr-9"
        />
        {keyword && (
          <button
            type="button"
            aria-label="キーワードをクリア"
            onClick={() => setKeyword('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
          >
            <XIcon size={14} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="history-date-filter" className="text-md text-text-tertiary">
          この日付以前を表示
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="history-date-filter"
            type="date"
            value={dateFilter}
            min={dateBounds?.min}
            max={dateBounds?.max}
            onChange={(e) => setDateFilter(e.target.value)}
            className="flex-1"
          />
          {dateFilter && (
            <button
              type="button"
              aria-label="日付フィルターをクリア"
              onClick={() => setDateFilter('')}
              className="p-1 text-text-muted hover:text-text-primary"
            >
              <XIcon size={14} />
            </button>
          )}
        </div>
      </div>

      <Button variant="secondary" onClick={() => setDeleteAllOpen(true)}>
        すべての履歴を削除
      </Button>
    </div>
  );

  const activeFilterChips = activeFilterCount > 0 && (
    <div className="flex flex-wrap gap-2">
      {keyword.trim() && <FilterChip label={keyword.trim()} onRemove={() => setKeyword('')} />}
      {dateFilter && <FilterChip label={`${formatDateFilterLabel(dateFilter)}以前`} onRemove={() => setDateFilter('')} />}
    </div>
  );

  return (
    <div>
      <SectionHeading className="mb-5">視聴履歴</SectionHeading>

      {historyEntries.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon />}
          title="視聴履歴はありません"
          description="気になる動画を視聴して記録を残しましょう"
          action={
            <LinkButton href="/playlists" variant="primary">
              動画を探す
            </LinkButton>
          }
        />
      ) : (
        <>
          {/* モバイル: アコーディオン形式の操作パネル（/playlists §7.1〜§7.3と同じ方針） */}
          <div className="mb-5 md:hidden">
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              aria-expanded={panelOpen}
              className="flex w-full items-center justify-between rounded-[12px] border border-border-card bg-gradient-card px-4 py-3 text-left"
            >
              <span className="inline-flex items-center gap-2 text-base text-text-primary">
                <SearchIcon size={15} />
                絞り込み{activeFilterCount > 0 && `（${activeFilterCount}件適用中）`}
              </span>
              {panelOpen ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
            </button>
            {panelOpen && <Card className="mt-3">{controlPanel}</Card>}
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[68fr_32fr]">
            <div className="flex flex-col gap-6">
              {activeFilterChips}

              {visible.length === 0 ? (
                <p className="py-10 text-center text-base text-text-muted">該当する視聴履歴はありません</p>
              ) : (
                groups.map((group) => (
                  <div key={group.items[0].id} className="flex flex-col gap-3">
                    <p className="text-md font-medium text-text-tertiary">── {group.label} ──</p>
                    <ul className="flex flex-col gap-3">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <HistoryCard entry={item} onDelete={() => setDeleteTarget(item)} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>

            <Card className="hidden h-fit md:block">
              <p className="mb-4 text-lg font-medium text-text-primary">操作</p>
              {controlPanel}
            </Card>
          </div>
        </>
      )}

      <Modal
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="視聴履歴を削除しますか？"
        description="この動画の視聴履歴を削除します。この操作は取り消せません。"
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={busy}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={handleDeleteOne} loading={busy}>
            削除する
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteAllOpen}
        onOpenChange={setDeleteAllOpen}
        title="すべての視聴履歴を削除しますか？"
        description="視聴履歴をすべて削除します。この操作は取り消せません。"
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteAllOpen(false)} disabled={busy}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={handleDeleteAll} loading={busy}>
            すべて削除する
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[20px] border border-border-chip bg-bg-input px-3 py-1 text-sm text-text-secondary">
      {label}
      <button type="button" aria-label={`${label}を解除`} onClick={onRemove} className="text-text-muted hover:text-text-primary">
        <XIcon size={11} />
      </button>
    </span>
  );
}

function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="読み込み中">
      <Skeleton className="h-6 w-[120px]" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} flush>
          <div className="flex gap-3 p-3 md:gap-4 md:p-4">
            <Skeleton className="aspect-video w-[128px] shrink-0 md:w-[224px]" />
            <SkeletonText lines={3} className="flex-1" />
          </div>
        </Card>
      ))}
    </div>
  );
}
