/**
 * ゲームタイトル選択モーダル（ページ 再生リストを追加する 仕様書 §4.2.1）。
 * 検索欄でインクリメンタル絞り込み、行クリックで選択して閉じる。
 * 候補のサムネイルは games.packageImageUrl（楽天ブックスの縦長パッケージ画像。無ければプレースホルダー）。
 * フッターは案内文「お探しのゲームタイトルが見つかりませんか？」＋secondaryボタン。
 * 一般ユーザーには`onEnterNew`で「新しいゲームタイトルとして入力する」（§4.2.2 v3.15。検索欄の文字を渡し、フォーム側で入力に切り替える）、
 * 管理者には`onAddNew`で「新しいゲームタイトルを登録する」（GameCreateModal、フェーズ4.5ステップ2）を出す。
 * どちらも渡されなければフッターは出さない。
 */
'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { PlusIcon, SearchIcon } from '@/components/ui/icons';

export interface GameOption {
  id: string;
  title: string;
  packageImageUrl: string | null;
}

interface GameSelectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  games: GameOption[];
  onSelect: (game: GameOption) => void;
  /** 管理者専用の直接登録モーダルを開く。渡された場合のみフッターリンクを表示する */
  onAddNew?: () => void;
  /** 一般ユーザー向け: 新しいゲームタイトルとして入力する（検索欄の文字を渡す）。onAddNew とはどちらか一方を渡す */
  onEnterNew?: (query: string) => void;
}

export function GameSelectModal({ open, onOpenChange, games, onSelect, onAddNew, onEnterNew }: GameSelectModalProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return games;
    return games.filter((g) => g.title.toLowerCase().includes(q));
  }, [games, search]);

  function handleOpenChange(next: boolean) {
    if (!next) setSearch('');
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

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-base text-text-muted">
            {games.length === 0 ? 'ゲームタイトルが登録されていません' : '該当するゲームタイトルがありません'}
          </p>
        ) : (
          <ul className="-mx-2 max-h-[50dvh] overflow-y-auto">
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
                  <span className="block h-14 w-10 shrink-0 overflow-hidden rounded-[4px] bg-bg-btn">
                    {g.packageImageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.packageImageUrl} alt="" className="size-full object-cover" />
                    )}
                  </span>
                  <span className="line-clamp-2 text-base text-text-secondary">{g.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

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
