'use client';

/**
 * 「URLのコピーのしかた」（ページ 提案する 仕様書 §8）。入力欄の下に折りたたみで出し、パソコン／スマホを切り替えて見せる。
 * 図はイラスト（YouTube のロゴ・画面写真は使わない）。チャンネル側と、再生リスト側の URL 入力で中身を変える。
 */
import { useState } from 'react';
import { ChevronDownIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';

type Device = 'pc' | 'phone';

const STEPS: Record<'channel' | 'playlist', Record<Device, { lead: string; steps: string[]; address?: string }>> = {
  channel: {
    pc: {
      lead: 'そのチャンネルの動画か、チャンネルのページを開いて、ブラウザ上部のアドレス欄をコピーします。',
      steps: ['動画またはチャンネルのページを開く', 'アドレス欄をクリックしてコピー', 'ここに貼り付ける'],
      address: 'youtube.com/watch?v=…　または　youtube.com/@…',
    },
    phone: {
      lead: 'YouTubeアプリで、そのチャンネルの動画を開いて「共有」からリンクをコピーします。',
      steps: ['動画の下の「共有」をタップ', '「リンクをコピー」をタップ', 'ここに貼り付ける'],
    },
  },
  playlist: {
    pc: {
      lead: '再生リストのページ、または再生リストの中の動画を開いて、ブラウザ上部のアドレス欄をコピーします。',
      steps: ['再生リスト（またはその中の動画）を開く', 'アドレス欄をクリックしてコピー', 'ここに貼り付ける'],
      address: 'youtube.com/playlist?list=…',
    },
    phone: {
      lead: 'YouTubeアプリで再生リストを開いて「共有」からリンクをコピーします。',
      steps: ['再生リストを開く', '「共有」→「リンクをコピー」をタップ', 'ここに貼り付ける'],
    },
  },
};

export function UrlCopyGuide({ kind }: { kind: 'channel' | 'playlist' }) {
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<Device>('phone');
  const guide = STEPS[kind][device];
  return (
    <div className="rounded-[8px] border border-border-card bg-bg-child" data-testid="url-copy-guide">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-md text-text-secondary hover:text-text-primary"
      >
        <span>URLのコピーのしかた</span>
        <ChevronDownIcon size={16} className={cn('shrink-0 transition-transform duration-[120ms]', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-border-card px-3 py-3">
          <div className="flex gap-2" role="group" aria-label="使っている端末">
            {(
              [
                ['phone', 'スマホ'],
                ['pc', 'パソコン'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDevice(value)}
                aria-pressed={device === value}
                className={cn(
                  'rounded-full border px-3 py-1 text-md',
                  device === value ? 'border-border-active bg-bg-selected text-text-primary' : 'border-border-card text-text-tertiary hover:text-text-primary',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-md text-text-secondary">{guide.lead}</p>
          {guide.address && (
            <div className="rounded-[8px] border border-border-card bg-bg-input p-2">
              <p className="mb-1 text-xs text-text-muted">ブラウザのアドレス欄</p>
              <p className="rounded-full border-2 border-brand-primary px-3 py-1 font-mono text-sm text-text-primary">{guide.address}</p>
            </div>
          )}
          <ol className="flex flex-col gap-2 sm:flex-row">
            {guide.steps.map((step, i) => (
              <li key={step} className="flex flex-1 items-start gap-2 rounded-[8px] bg-bg-input px-3 py-2 text-md text-text-secondary">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-semibold text-text-primary">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
