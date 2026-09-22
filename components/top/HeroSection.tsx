/**
 * TOPページ ヒーローセクション（未ログイン時のみ、ページ top 仕様書 §4）。
 * キャッチコピー・サービス名・検索バー（`/playlists?q=`へ遷移、§4.3: Enterキー or 検索ボタンクリック）・
 * 「初めての方へ →」（`/about`）をコンパクトな帯として配置する。
 * `Card`は`flush`にしてパディングを本体側で明示する（`p-[18px]`と`py-*`を同時指定すると、
 * `cn`がtailwind-mergeを持たないためどちらが効くかクラス順序依存になってしまうため）。
 */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { SearchIcon } from '@/components/ui/icons';
import { SERVICE_TAGLINE } from '@/components/layout/nav';

export function HeroSection() {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = keyword.trim();
    router.push(q ? `/playlists?q=${encodeURIComponent(q)}` : '/playlists');
  }

  return (
    <Card flush className="flex flex-col gap-4 px-5 py-6 md:px-6 md:py-8">
      <div className="flex flex-col gap-1">
        <p className="text-md text-text-tertiary">{SERVICE_TAGLINE}</p>
        <p className="text-heading font-bold text-text-primary">プレミテ</p>
      </div>
      <form onSubmit={handleSubmit} className="relative max-w-[520px]">
        <Input
          type="text"
          placeholder="ゲームタイトル・チャンネル名で検索"
          aria-label="ゲームタイトル・チャンネル名で検索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="pr-10"
        />
        <button
          type="submit"
          aria-label="検索"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
        >
          <SearchIcon size={16} />
        </button>
      </form>
      <Link href="/about" className="w-fit text-md text-text-tertiary hover:text-text-primary">
        初めての方へ →
      </Link>
    </Card>
  );
}
