/**
 * キーボード操作時にプレーヤー中央へ短く出す操作表示（動画プレーヤー仕様書「キーボード操作」）。
 * ページ側から IFrame API で操作しても YouTube 側の表示はほとんど出ないため、何が起きたかをここで示す。
 * 呼び出し側は操作のたびに `key` を変えて再マウントし、OSD_DURATION_MS 後に外す。
 * 出た直後は不透明のまま見せ、最後の 200ms（既存 animate-fade-out の長さ）でフェードアウトする。
 * pointer-events-none で下の iframe のクリックを妨げない。
 */
import type { ReactNode } from 'react';

export const OSD_DURATION_MS = 700;
// globals.css の --animate-fade-out（200ms）と揃える
const FADE_OUT_MS = 200;

export function PlayerOsd({ icon, text }: { icon?: ReactNode; text?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className="flex min-w-16 animate-fade-out items-center justify-center gap-2 rounded-full bg-overlay px-4 py-3 text-md font-medium text-white"
        style={{ animationDelay: `${OSD_DURATION_MS - FADE_OUT_MS}ms` }}
      >
        {icon}
        {text && <span>{text}</span>}
      </div>
    </div>
  );
}
