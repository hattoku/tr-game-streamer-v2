/**
 * ゲームタイトル選択モーダル（ページ 再生リストを追加する 仕様書 §4.2.1）。
 * 検索欄でインクリメンタル絞り込み、行クリックで選択して閉じる。
 * 候補のサムネイルは games.packageImageUrl（楽天ブックスの縦長パッケージ画像。無ければプレースホルダー）。
 * フッターの「ゲームタイトルの登録を提案する」（§4.2.2）は一般ユーザー向けの機能で、管理者には出さない仕様
 * （§4.2.2 対象ユーザー）。管理者専用の現状では置かない。
 */
'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { SearchIcon } from '@/components/ui/icons';

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
}

export function GameSelectModal({ open, onOpenChange, games, onSelect }: GameSelectModalProps) {
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
      </div>
    </Modal>
  );
}
