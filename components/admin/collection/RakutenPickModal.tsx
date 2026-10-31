/**
 * 収集候補の新規ゲームに結び付ける楽天ブックスの商品を選ぶモーダル（管理 AI運営者向け収集候補レビューUI仕様書 v2.2 §3.7）。
 * 保存済みの検索結果を並べ、検索語を変えて探し直せる。「楽天なし」を選ぶと名前だけで登録する。
 */
'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/components/ui/cn';
import { SearchIcon } from '@/components/ui/icons';
import type { RakutenPick, RakutenSearchResult } from '@/lib/collection-admin';

interface RakutenPickModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 承認時に登録するゲーム名 */
  gameTitle: string;
  result: RakutenSearchResult | null;
  selectedJan: string | null;
  /** 検索語で探し直す。結果は呼び出し側が result に反映する。失敗したら false */
  onSearch: (query: string) => Promise<boolean>;
  onPick: (item: RakutenPick) => void;
  onNone: () => void;
}

export function RakutenPickModal(props: RakutenPickModalProps) {
  return (
    <Modal open={props.open} onOpenChange={props.onOpenChange} title="楽天ブックスの商品を選ぶ" maxWidthClassName="max-w-[560px]">
      {/* 開くたびに検索欄を作り直し、前の候補で入れた語句が残らないようにする */}
      {props.open && <RakutenPickBody {...props} />}
    </Modal>
  );
}

function RakutenPickBody({ gameTitle, result, selectedJan, onSearch, onPick, onNone }: RakutenPickModalProps) {
  const [query, setQuery] = useState(result?.query || gameTitle);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      if (!(await onSearch(q))) setError('楽天ブックスの検索に失敗しました。時間をおいて再試行してください');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-md text-text-tertiary">ゲーム名「{gameTitle}」で登録します。選んだ商品のパッケージ画像・機種・ジャンルを入れます。</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleSearch();
        }}
      >
        <Input aria-label="楽天ブックスの検索語" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1" disabled={searching} />
        <Button type="submit" variant="secondary" loading={searching} disabled={!query.trim()}>
          <SearchIcon size={14} />
          検索
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-md text-input-error">
          {error}
        </p>
      )}

      {!result ? (
        <p className="text-md text-text-tertiary">まだ検索していません。検索語を入れて「検索」を押してください。</p>
      ) : result.items.length === 0 ? (
        <p className="text-md text-text-tertiary">
          「{result.query}」では見つかりませんでした。検索語を変えるか、楽天なしで登録してください。
          {/^[\x20-\x7E]+$/.test(result.query) && '英語名のゲームは、楽天ではカタカナ（例: Pacific Drive → パシフィックドライブ）で登録されていることが多いです。'}
        </p>
      ) : (
        // 見た目は GameCreateModal の楽天ブックス検索の候補一覧に揃える。選んでいる商品は枠で示す
        <ul className="flex max-h-[320px] flex-col gap-1 overflow-y-auto rounded-[8px] border border-border-card p-1" aria-label="楽天ブックスの検索結果">
          {result.items.map((item) => (
            <li key={item.jan}>
              <button
                type="button"
                onClick={() => onPick(item)}
                aria-pressed={selectedJan === item.jan}
                className={cn(
                  'flex w-full items-center gap-3 rounded-[6px] border p-2 text-left hover:bg-bg-input',
                  selectedJan === item.jan ? 'border-border-active' : 'border-transparent',
                )}
              >
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" className="h-[64px] w-[48px] shrink-0 rounded-[4px] object-cover" />
                ) : (
                  <div className="h-[64px] w-[48px] shrink-0 rounded-[4px] bg-bg-btn" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm text-text-primary">{item.title}</span>
                  <span className="block text-xs text-text-tertiary">{[item.hardware, item.salesDate].filter(Boolean).join(' / ')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" onClick={onNone}>
          楽天なしで登録する
        </Button>
      </div>
    </div>
  );
}
