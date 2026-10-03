/**
 * 再生リスト詳細ページのショートカット一覧（動画プレーヤー仕様書「キーボード操作」）。
 * 「?」キーで開く。表示内容は usePlayerShortcuts の SHORTCUTS を使う。
 */
'use client';

import { Modal } from '@/components/ui/Modal';
import { SHORTCUTS } from './usePlayerShortcuts';

export function PlayerShortcutsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="キーボードショートカット"
      description="プレーヤーをクリックした後は、YouTube のショートカットがそのまま使えます。"
    >
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
        {SHORTCUTS.map((s) => (
          <div key={s.label} className="contents">
            <dt className="flex items-center gap-1">
              {s.keys.map((alt, i) => (
                <span key={alt} className="flex items-center gap-1">
                  {i > 0 && <span className="text-sm text-text-muted">/</span>}
                  {alt.split('+').map((k, j) => (
                    <span key={k} className="flex items-center gap-1">
                      {j > 0 && <span className="text-sm text-text-muted">+</span>}
                      <kbd className="inline-flex min-w-7 justify-center rounded-[6px] border border-surface-border bg-bg-hover px-2 py-[2px] font-sans text-sm text-text-primary">
                        {k}
                      </kbd>
                    </span>
                  ))}
                </span>
              ))}
            </dt>
            <dd className="min-w-0 text-base text-text-secondary">{s.label}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
