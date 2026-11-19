/**
 * 新規登録の推移（管理 ユーザー管理仕様書 §3.7）。日別（直近30日）・週別（直近12週・月曜始まり）・月別（直近12か月）を切り替える棒グラフ。
 * 1系列なので凡例は置かず、見出しが何の数かを示す。棒にカーソルを当てる（タップする）と期間と件数を出し、
 * 同じ数字は「表で見る」でも読める。一般ユーザーだけを数える（管理者・テスト用会員は除く。2026-11-17 ユーザー決定）。
 */
'use client';

import { useMemo, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { bucketSignups, type SignupGranularity } from '@/lib/account-status-shared';

const GRANULARITY_LABEL: Record<SignupGranularity, string> = { day: '日別', week: '週別', month: '月別' };
const RANGE_LABEL: Record<SignupGranularity, string> = { day: '直近30日', week: '直近12週', month: '直近12か月' };

const CHART_HEIGHT = 160;

function periodLabel(start: string, granularity: SignupGranularity): string {
  const [y, m, d] = start.split('-').map(Number);
  if (granularity === 'month') return `${y}年${m}月`;
  if (granularity === 'week') return `${y}年${m}月${d}日の週`;
  return `${y}年${m}月${d}日`;
}

export function SignupChart({ createdAts }: { createdAts: Array<string | null> }) {
  const [granularity, setGranularity] = useState<SignupGranularity>('day');
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  // 描画のたびに「今」が変わらないよう、開いた時点で固定する
  const [now] = useState(() => Date.now());

  const buckets = useMemo(() => bucketSignups(createdAts, granularity, now), [createdAts, granularity, now]);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  // 目盛りは 0・半分・最大の3本だけ（細かい罫線は置かない）
  const ticks = [max, Math.round(max / 2), 0].filter((v, i, a) => a.indexOf(v) === i);
  // 軸ラベルは間引く（日別は5本に1本、他は2本に1本）
  const labelEvery = granularity === 'day' ? 5 : 2;
  const activeBucket = active !== null ? buckets[active] : null;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>新規登録の推移</CardTitle>
          <p className="mt-1 text-md text-text-muted">
            {RANGE_LABEL[granularity]}で <span className="text-text-primary">{total.toLocaleString()}人</span>（一般ユーザー）
          </p>
        </div>
        <Tabs
          value={granularity}
          onValueChange={(v) => {
            setGranularity(v as SignupGranularity);
            setActive(null);
          }}
        >
          <TabsList aria-label="集計の単位">
            {(Object.keys(GRANULARITY_LABEL) as SignupGranularity[]).map((g) => (
              <TabsTrigger key={g} value={g}>
                {GRANULARITY_LABEL[g]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* 選んだ棒の期間と件数（ホバー・タップ・フォーカスで更新） */}
      <p className="mb-2 h-5 text-md text-text-secondary" aria-live="polite" data-testid="signup-chart-readout">
        {activeBucket ? `${periodLabel(activeBucket.start, granularity)}：${activeBucket.count.toLocaleString()}人` : ''}
      </p>

      <div className="flex gap-2">
        {/* 縦軸の目盛り */}
        <div className="relative w-6 shrink-0 text-right text-sm text-text-muted" style={{ height: CHART_HEIGHT }} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: CHART_HEIGHT - (t / max) * CHART_HEIGHT }}>
              {t}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="relative flex items-end gap-[2px] border-b border-surface-border"
            style={{ height: CHART_HEIGHT }}
            role="img"
            aria-label={`新規登録の推移（${GRANULARITY_LABEL[granularity]}、${RANGE_LABEL[granularity]}）。合計${total}人`}
            onMouseLeave={() => setActive(null)}
            data-testid="signup-chart"
          >
            {/* 半分の目盛り線（控えめに） */}
            <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-surface-border" style={{ top: CHART_HEIGHT / 2 }} aria-hidden="true" />
            {buckets.map((b, i) => (
              // 当たり判定は列全体（棒が低くても選びやすいように）
              <button
                key={b.start}
                type="button"
                className="group relative flex h-full min-w-0 flex-1 items-end outline-none"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                aria-label={`${periodLabel(b.start, granularity)} ${b.count}人`}
                data-count={b.count}
              >
                <span
                  className={`block w-full rounded-t-[4px] transition-[filter] duration-[120ms] ${active === i ? 'brightness-125' : ''} group-focus-visible:brightness-125`}
                  style={{
                    height: b.count === 0 ? 0 : Math.max(2, (b.count / max) * CHART_HEIGHT),
                    backgroundColor: 'var(--color-brand-primary)',
                  }}
                />
              </button>
            ))}
          </div>
          {/* 横軸のラベル（間引く） */}
          <div className="mt-1 flex gap-[2px] text-sm text-text-muted" aria-hidden="true">
            {buckets.map((b, i) => (
              <span key={b.start} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">
                {i % labelEvery === 0 || i === buckets.length - 1 ? b.label : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="mt-3 text-md text-text-tertiary underline underline-offset-[3px] hover:text-text-primary"
        onClick={() => setShowTable((v) => !v)}
        aria-expanded={showTable}
      >
        {showTable ? '表を閉じる' : '表で見る'}
      </button>
      {showTable && (
        <table className="mt-2 w-full text-md" data-testid="signup-chart-table">
          <thead>
            <tr className="text-text-muted">
              <th className="py-1 text-left font-normal">期間</th>
              <th className="py-1 text-right font-normal">新規登録</th>
            </tr>
          </thead>
          <tbody>
            {[...buckets].reverse().map((b) => (
              <tr key={b.start} className="border-t border-surface-border text-text-secondary">
                <td className="py-1">{periodLabel(b.start, granularity)}</td>
                <td className="py-1 text-right">{b.count.toLocaleString()}人</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
