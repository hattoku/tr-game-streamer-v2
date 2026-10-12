/**
 * 再生リスト詳細の「この再生リストを含むまとめ」（まとめ機能仕様書 §7 発見導線）。
 * 公開まとめのみを新着順で最大5件、右カラム（スマホはページ最後）に収まるようタイトル・作成者・件数の
 * コンパクトな行で表示する。1件も無ければカードごと出さない。
 * 定義は再生リスト詳細仕様書「この再生リストを含むまとめセクション」、決定の経緯はまとめ機能仕様書 §1（2026-10-12）。
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserAvatar } from '@/components/layout/UserDropdown';
import { Card, CardTitle } from '@/components/ui/Card';
import { fetchPublicCollectionsContaining, type CollectionData } from '@/lib/collections';

const MAX_ITEMS = 5;

export function ContainingCollectionsCard({ playlistId }: { playlistId: string }) {
  const [collections, setCollections] = useState<CollectionData[] | null>(null);

  // 再生リスト間の遷移でコンポーネントが再利用されたとき、古い取得結果で上書きしない
  useEffect(() => {
    let cancelled = false;
    fetchPublicCollectionsContaining(playlistId)
      .then((list) => {
        if (!cancelled) setCollections(list);
      })
      .catch(() => {
        if (!cancelled) setCollections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [playlistId]);

  if (!collections || collections.length === 0) return null;

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>この再生リストを含むまとめ</CardTitle>
      <ul className="flex flex-col">
        {collections.slice(0, MAX_ITEMS).map((c) => (
          <li key={c.id} className="border-t border-border-divider first:border-t-0">
            <Link href={`/collections/${c.id}`} className="group flex flex-col gap-1 py-3">
              <span className="line-clamp-2 break-words text-base font-medium text-text-primary group-hover:text-text-secondary">
                {c.title}
              </span>
              <span className="flex min-w-0 items-center gap-2 text-md text-text-muted">
                <UserAvatar name={c.userDisplayName} imageUrl={c.userProfileImageUrl} size={18} />
                <span className="min-w-0 truncate">{c.userDisplayName}</span>
                <span className="shrink-0">全{c.playlistIds.length}件</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
