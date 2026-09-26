/**
 * Web App Manifest（/manifest.webmanifest として配信される）。
 * ホーム画面への追加（PWAインストール）に必要な情報を定義する（技術スタック仕様書 §2.10）。
 * アイコンは scripts/generate-app-icons.mjs で元画像から生成したもの。
 */
import type { MetadataRoute } from 'next';
import { APP_DISPLAY_NAME } from '../lib/app-env';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: APP_DISPLAY_NAME,
    short_name: APP_DISPLAY_NAME,
    description: 'ゲーム実況動画の再生リスト視聴記録＆新着通知サービス',
    lang: 'ja',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // デザイントークン --color-bg-base と揃える
    background_color: '#0f0f0f',
    theme_color: '#0f0f0f',
    icons: [
      { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
