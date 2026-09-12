/**
 * グローバルのローディングUI（共通 uiコンポーネント フロント 仕様書 §9.4）。
 * ヘッダー（(main) レイアウト側）は表示されたまま、メインコンテンツ領域に汎用的なカードの
 * スケルトングリッドを出す。ページ固有のスケルトンは各ルートの loading.tsx で上書きする。
 */
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="読み込み中">
      <Skeleton className="mb-6 h-6 w-[200px]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-[10px] border-[0.5px] border-border-default bg-bg-card p-3">
            <Skeleton className="aspect-video w-full" />
            <SkeletonText lines={2} className="mt-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
