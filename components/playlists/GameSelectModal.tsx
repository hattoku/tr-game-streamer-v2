/**
 * ゲームタイトル選択モーダル（ページ 再生リストを追加する 仕様書 §4.2.1）。
 * 検索欄でインクリメンタル絞り込み、行クリックで選択して閉じる。
 * 候補のサムネイルは games.packageImageUrl（楽天ブックスの縦長パッケージ画像。無ければプレースホルダー）。
 * フッターは案内文「お探しのゲームタイトルが見つかりませんか？」＋secondaryボタン。
 * 一般ユーザーには`onEnterNew`で「新しいゲームタイトルとして入力する」（§4.2.2 v3.15。検索欄の文字を渡し、フォーム側で入力に切り替える）、
 * 管理者には`onAddNew`で「新しいゲームタイトルを登録する」（GameCreateModal、フェーズ4.5ステップ2）を出す。
 * どちらも渡されなければフッターは出さない。
 * 検索はタイトル名と別名（games.aliases）を、表記ゆれを無視した部分一致で照合する（§9.2 v4.0）。
 * `onPickRakuten` を渡すと（一般ユーザー）、登録済みの候補の下に楽天ブックスの候補を出す（検索欄に2文字以上入れて少し待つと
 * /api/games/rakuten-search を呼ぶ）。登録済みのゲームタイトルと同じ名前になる商品は候補から外す。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { auth } from '@/lib/firebase';
import { matchesGameQuery, normalizeForSearch } from '@/lib/game-shared';
import { normalizeRakutenGameTitle } from '@/lib/rakuten-shared';
import type { RakutenGameSearchResult } from '@/lib/rakuten';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { PlusIcon, SearchIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';

export interface GameOption {
  id: string;
  title: string;
  packageImageUrl: string | null;
  /** 別名（検索用）。読み込んでいない画面では省略 */
  aliases?: string[];
}

// 楽天の検索を始めるまでの待ち時間と、検索する最小文字数
// サーバー側（/api/games/rakuten-search）はユーザーごとに1.5秒の間隔を求めるため、それより長く待つ。
// それでも 429 が返ったら（連続入力の間が詰まった場合）少し待って1回だけ取り直す
const RAKUTEN_DEBOUNCE_MS = 1600;
const RAKUTEN_RETRY_MS = 1600;
const RAKUTEN_MIN_QUERY = 2;

interface GameSelectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  games: GameOption[];
  onSelect: (game: GameOption) => void;
  /** 管理者専用の直接登録モーダルを開く。渡された場合のみフッターリンクを表示する */
  onAddNew?: () => void;
  /** 一般ユーザー向け: 新しいゲームタイトルとして入力する（検索欄の文字を渡す）。onAddNew とはどちらか一方を渡す */
  onEnterNew?: (query: string) => void;
  /** 一般ユーザー向け: 楽天ブックスの候補を選んだとき（新しいゲームタイトルとしてフォームに入れる） */
  onPickRakuten?: (item: RakutenGameSearchResult) => void;
}

export function GameSelectModal({ open, onOpenChange, games, onSelect, onAddNew, onEnterNew, onPickRakuten }: GameSelectModalProps) {
  const [search, setSearch] = useState('');
  // 楽天ブックスの候補（onPickRakuten があるときだけ使う）。query は結果がどの検索語のものか
  const [rakuten, setRakuten] = useState<{ query: string; status: 'loading' | 'done' | 'error' | 'rate_limited'; results: RakutenGameSearchResult[] } | null>(null);

  const filtered = useMemo(() => games.filter((g) => matchesGameQuery(g, search)), [games, search]);

  const trimmedSearch = search.trim();
  const rakutenEnabled = !!onPickRakuten && open && normalizeForSearch(trimmedSearch).length >= RAKUTEN_MIN_QUERY;
  useEffect(() => {
    if (!rakutenEnabled) return;
    const query = trimmedSearch;
    const timer = setTimeout(async () => {
      setRakuten({ query, status: 'loading', results: [] });
      try {
        if (!auth.currentUser) throw new Error('not signed in');
        const idToken = await auth.currentUser.getIdToken();
        const call = () =>
          fetch(`/api/games/rakuten-search?title=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${idToken}` } });
        let res = await call();
        if (res.status === 429) {
          await new Promise((resolve) => setTimeout(resolve, RAKUTEN_RETRY_MS));
          res = await call();
        }
        const body = await res.json();
        setRakuten((prev) =>
          prev?.query === query
            ? { query, status: res.ok ? 'done' : res.status === 429 ? 'rate_limited' : 'error', results: res.ok ? (body.results ?? []) : [] }
            : prev,
        );
      } catch {
        setRakuten((prev) => (prev?.query === query ? { query, status: 'error', results: [] } : prev));
      }
    }, RAKUTEN_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rakutenEnabled, trimmedSearch]);

  // 登録済みのゲームタイトル（タイトル名・別名）と同じ名前になる楽天の商品は出さない（一覧から選べばよいため）
  const rakutenCandidates = useMemo(() => {
    if (!rakuten || rakuten.query !== trimmedSearch) return [];
    const registered = new Set(games.flatMap((g) => [g.title, ...(g.aliases ?? [])]).map(normalizeForSearch));
    return rakuten.results.filter((r) => !registered.has(normalizeForSearch(normalizeRakutenGameTitle(r.title))));
  }, [rakuten, trimmedSearch, games]);
  const rakutenStatus = rakuten && rakuten.query === trimmedSearch ? rakuten.status : rakutenEnabled ? 'loading' : null;

  function handleOpenChange(next: boolean) {
    if (!next) {
      setSearch('');
      setRakuten(null);
    }
    onOpenChange(next);
  }

  return (
    <Modal open={open} onOpenChange={handleOpenChange} title="ゲームタイトルを選択" maxWidthClassName="max-w-[560px]">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            type="search"
            placeholder="ゲームタイトルを検索..."
            aria-label="ゲームタイトルを検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="-mx-2 max-h-[50dvh] overflow-y-auto">
          {onPickRakuten && trimmedSearch && <p className="px-2 pb-1 text-md text-text-tertiary">登録済みのゲームタイトル</p>}
          {filtered.length === 0 ? (
            <p className={cn('text-center text-base text-text-muted', onPickRakuten && trimmedSearch ? 'py-4' : 'py-8')}>
              {games.length === 0 ? 'ゲームタイトルが登録されていません' : '該当するゲームタイトルがありません'}
            </p>
          ) : (
            <ul>
              {filtered.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(g);
                      handleOpenChange(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-[6px] px-2 py-2 text-left transition-colors duration-[120ms] hover:bg-bg-hover focus-visible:bg-bg-hover"
                  >
                    <PackageThumb url={g.packageImageUrl} />
                    <span className="line-clamp-2 text-base text-text-secondary">{g.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* 楽天ブックスの候補（一般ユーザー、§9.2）。選ぶと新しいゲームタイトルとしてフォームに入る */}
          {onPickRakuten && rakutenStatus && (
            <div className="mt-3 border-t border-border-divider pt-3">
              <p className="px-2 pb-1 text-md text-text-tertiary">楽天ブックスの候補（まだ登録されていないゲーム）</p>
              {rakutenStatus === 'loading' ? (
                <p className="px-2 py-3 text-base text-text-muted">楽天ブックスで探しています…</p>
              ) : rakutenStatus === 'rate_limited' ? (
                <p className="px-2 py-3 text-base text-text-muted">
                  楽天ブックスの検索が混み合っています。しばらく待ってから入力し直すか、「新しいゲームタイトルとして入力する」で入力してください
                </p>
              ) : rakutenStatus === 'error' ? (
                <p className="px-2 py-3 text-base text-text-muted">楽天ブックスの候補を取得できませんでした。少し待ってから入力し直してください</p>
              ) : rakutenCandidates.length === 0 ? (
                <p className="px-2 py-3 text-base text-text-muted">楽天ブックスに候補はありませんでした</p>
              ) : (
                <ul>
                  {rakutenCandidates.map((r, i) => (
                    <li key={`${r.itemUrl}-${i}`}>
                      <button
                        type="button"
                        onClick={() => {
                          onPickRakuten(r);
                          handleOpenChange(false);
                        }}
                        className="flex w-full items-center gap-3 rounded-[6px] px-2 py-2 text-left transition-colors duration-[120ms] hover:bg-bg-hover focus-visible:bg-bg-hover"
                      >
                        <PackageThumb url={r.imageUrl || null} />
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-base text-text-secondary">{r.title}</span>
                          <span className="block text-md text-text-muted">{[r.hardware, r.salesDate].filter(Boolean).join(' / ')}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {(onAddNew || onEnterNew) && (
          <div className="flex flex-col gap-3 border-t border-border-divider pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-base text-text-muted">お探しのゲームタイトルが見つかりませんか？</p>
            <Button
              variant="secondary"
              onClick={() => {
                // 閉じると検索欄がリセットされるため、先に値を取っておく
                const query = search.trim();
                handleOpenChange(false);
                if (onAddNew) onAddNew();
                else onEnterNew?.(query);
              }}
              className="w-full sm:w-auto"
            >
              <PlusIcon size={14} />
              {onAddNew ? '新しいゲームタイトルを登録する' : '新しいゲームタイトルとして入力する'}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** 候補行のパッケージ画像（縦長。無ければプレースホルダー） */
function PackageThumb({ url }: { url: string | null }) {
  return (
    <span className="block h-14 w-10 shrink-0 overflow-hidden rounded-[4px] bg-bg-btn">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      )}
    </span>
  );
}
