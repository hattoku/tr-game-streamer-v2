// ゲームのパッケージ画像を表示サイズに合った解像度で読み込むことの確認（2026-11-11、スマホで粗く見えた件）。
// ページ ゲームタイトル 詳細 仕様書 §3.2「ゲームタイトルのサムネイル」の解像度の行、ページ ゲームタイトル 探す 仕様書 §4 のゲームタイトル画像。
// 楽天の画像URLは保存時の `?_ex=200x200`（約123×200px）のまま持ち、表示のときに `_ex` を差し替える（lib/package-image.ts）。
import { expect, test } from './support/fixtures';
import { uniqueText } from './support/env';
import { db as e2eDb } from './support/cleanup';

// stg の実データと同じ形の楽天ブックスの画像URL（ゼルダの伝説 ティアーズ オブ ザ キングダム）
const RAKUTEN_IMAGE = 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/0979/4902370550979.jpg?_ex=200x200';

async function seedGame(title: string, packageImageUrl: string) {
  const ref = e2eDb().collection('games').doc();
  await ref.set({
    title, aliases: [], packageImageUrl, rakutenUrl: null, description: '', isAiGeneratedDescription: false, platforms: [],
    genreId: null, genreName: null, themeIds: [], gameTagIds: [], gameTagsFixed: [], playlistCount: 0,
    createdAt: new Date(), updatedAt: new Date(),
  });
  return ref.id;
}

test('ゲームタイトル詳細 §3.2: 楽天のパッケージ画像は大きめのサイズ（_ex=600x600）で読み込み、表示枠より小さい画像を引き伸ばさない', async ({ guestPage }) => {
  const gameId = await seedGame(uniqueText('高画質のゲーム'), RAKUTEN_IMAGE);
  try {
    await guestPage.goto(`/games/${gameId}`);
    const img = guestPage.locator(`img[src*="thumbnail.image.rakuten.co.jp"]`).first();
    await expect(img).toHaveAttribute('src', /[?&]_ex=600x600(&|$)/, { timeout: 30_000 });
    // 実際に届いた画像が、表示している枠の横幅（CSSピクセル×画面密度）以上あること
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);
    const { naturalWidth, needed } = await img.evaluate((el: HTMLImageElement) => ({
      naturalWidth: el.naturalWidth,
      needed: Math.round(el.getBoundingClientRect().width * Math.min(window.devicePixelRatio, 2)),
    }));
    expect(naturalWidth, `届いた画像の横幅 ${naturalWidth}px / 必要な横幅 ${needed}px`).toBeGreaterThanOrEqual(needed);
  } finally {
    await e2eDb().collection('games').doc(gameId).delete();
  }
});

test('ゲームタイトル詳細 §3.2: 楽天以外の画像URL（手入力）はそのまま表示する', async ({ guestPage }) => {
  const other = 'https://example.com/e2e/package.jpg?_ex=200x200';
  const gameId = await seedGame(uniqueText('手入力画像のゲーム'), other);
  try {
    await guestPage.goto(`/games/${gameId}`);
    await expect(guestPage.locator('img[src^="https://example.com/e2e/package.jpg"]').first()).toHaveAttribute('src', other, { timeout: 30_000 });
  } finally {
    await e2eDb().collection('games').doc(gameId).delete();
  }
});

test('ゲームタイトル 探す §4: 一覧カードの楽天のパッケージ画像は中くらいのサイズ（_ex=400x400）で読み込む', async ({ guestPage }) => {
  await guestPage.goto('/games');
  const imgs = guestPage.locator('a[href^="/games/"] img[src*="thumbnail.image.rakuten.co.jp"]');
  // stg には楽天画像つきのゲームが数十件ある（backfill 済み）
  await expect(imgs.first()).toBeVisible({ timeout: 30_000 });
  const srcs = await imgs.evaluateAll((els) => els.map((el) => el.getAttribute('src') ?? ''));
  for (const src of srcs) expect(src).toMatch(/[?&]_ex=400x400(&|$)/);
});
