'use client';

/**
 * 外部の画像（YouTube の配信者アイコンなど）を出し、URL が空のときや読めなかったときは fallback を出す。
 * 配信者がアイコンを差し替えると古い URL が読めなくなることがあり、そのままだと壊れた画像になるため（2026-11-17）。
 * サーバーで描いた img がハイドレーションより前に読み込みに失敗していると onError が届かないので、表示後に complete・naturalWidth でも確かめる。
 */
import { useEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode } from 'react';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
  /** 画像が無い・読めないときに出すもの（今までの「アイコンが無いとき」の表示） */
  fallback: ReactNode;
};

export function FallbackImage({ src, fallback, alt = '', referrerPolicy = 'no-referrer', onError, ...img }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (src && el && el.complete && el.naturalWidth === 0) setFailedSrc(src);
  }, [src]);

  if (!src || failedSrc === src) return <>{fallback}</>;
  return (
    // referrerPolicy: チャンネルアイコン（yt3.ggpht.com）は localhost 等の Referer 付きリクエストに 429 を返すことがあり、
    // 開発環境でリンク切れになるため既定で Referer を送らない
    // eslint-disable-next-line @next/next/no-img-element -- YouTube の画像URL（外部・可変）をそのまま表示する
    <img
      ref={ref}
      src={src}
      alt={alt}
      referrerPolicy={referrerPolicy}
      onError={(e) => {
        setFailedSrc(src);
        onError?.(e);
      }}
      {...img}
    />
  );
}
