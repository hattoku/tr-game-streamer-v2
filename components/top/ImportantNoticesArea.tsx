/**
 * TOP の一番上の「重要なお知らせ」エリア（管理 お知らせ管理仕様書 v2.0 §7.1、ページ top 仕様書 §3.1）。
 * 公開中で「重要」が ON、かつ終わり日時が無いか今より後のものを新しい順に出す。ログイン・未ログインとも。
 * ×で閉じたものは、その端末（localStorage）に ID を覚えて次から出さない。ベルの既読とは別。
 * 読み込みに失敗したら何も出さない（TOP の他のセクションを止めない）。
 */
'use client';

import { useEffect, useState } from 'react';
import { ImportantNoticeCard } from '@/components/notices/NoticeParts';
import { fetchImportantNotices } from '@/lib/notices';
import { NOTICE_DISMISSED_STORAGE_KEY, type PublicNotice } from '@/lib/notice-shared';

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(NOTICE_DISMISSED_STORAGE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  try {
    // 増え続けないよう新しい100件だけ残す
    window.localStorage.setItem(NOTICE_DISMISSED_STORAGE_KEY, JSON.stringify([...ids].slice(-100)));
  } catch {
    // 保存できなくても、その場では閉じる
  }
}

export function ImportantNoticesArea() {
  const [notices, setNotices] = useState<PublicNotice[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let active = true;
    fetchImportantNotices()
      .catch(() => [] as PublicNotice[])
      .then((list) => {
        if (!active) return;
        setDismissed(readDismissed());
        setNotices(list);
      });
    return () => {
      active = false;
    };
  }, []);

  const visible = (notices ?? []).filter((n) => !dismissed.has(n.id));
  if (visible.length === 0) return null;

  function dismiss(id: string) {
    const next = new Set(readDismissed());
    next.add(id);
    writeDismissed(next);
    setDismissed(next);
  }

  return (
    <section aria-label="重要なお知らせ" className="flex flex-col gap-3">
      {visible.map((n) => (
        <ImportantNoticeCard key={n.id} notice={n} href={`/notices/${n.id}`} onDismiss={() => dismiss(n.id)} />
      ))}
    </section>
  );
}
