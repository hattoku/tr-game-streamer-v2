// 再生位置の保存とプレーヤーの不調からの復帰
// （ページ 再生リスト詳細ページにおける動画プレーヤー 仕様書「再生時間の記録タイミング」「プレーヤーの不調からの復帰」）。
// テスト用会員（一般ユーザー）の進捗を使うため、対象の再生リストの進捗はテストの前に退避し、後で元に戻す。
// desktop と mobile が同時に走っても進捗が混ざらないよう、プロジェクトごとに別の再生リストを使う。
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { getProgressSeconds, playlistVideoIds, setProgress, stashProgress, testUserUid } from './support/watch-progress';

const PROJECT_PLAYLIST_INDEX: Record<string, number> = { desktop: 0, mobile: 1 };

let uid: string;
let playlistId: string;
let videoIds: string[];
let restore: (() => Promise<void>) | null = null;

/** 一覧から、このプロジェクト用の再生リストを選ぶ（データが足りなければテストを飛ばす） */
async function pickPlaylist(page: Page, testInfo: TestInfo): Promise<string | null> {
  await page.goto('/playlists');
  const links = page.locator('main a[href^="/playlists/"]:not([href="/playlists/new"]):not([href="/playlists/proposals"])');
  await links.first().waitFor({ timeout: 15_000 }).catch(() => {});
  const hrefs = [...new Set(await links.evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? '')))].filter((h) =>
    /^\/playlists\/[^/?#]+$/.test(h),
  );
  const href = hrefs[PROJECT_PLAYLIST_INDEX[testInfo.project.name] ?? 0];
  return href ? href.split('/')[2] : null;
}

/** 埋め込みプレーヤーの iframe（作り直しの確認に使う） */
function playerIframe(page: Page) {
  return page.locator('iframe[src*="youtube"]').first();
}

/**
 * スリープ・長時間のタブ非表示からの復帰をまねる。タブを非表示にし、時計を 11 分進めてから表示に戻す
 * （ページの Date.now だけを進める。YouTube の iframe には影響しない）
 */
async function simulateLongSleep(page: Page) {
  await page.evaluate(() => {
    const realNow = Date.now.bind(Date);
    let visibility: DocumentVisibilityState = 'hidden';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    document.dispatchEvent(new Event('visibilitychange'));
    Date.now = () => realNow() + 11 * 60 * 1000;
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test.beforeEach(async ({ userPage }, testInfo) => {
  const picked = await pickPlaylist(userPage, testInfo);
  test.skip(!picked, '再生リストが足りないため飛ばします');
  playlistId = picked!;
  videoIds = await playlistVideoIds(playlistId);
  test.skip(videoIds.length === 0, '動画が無い再生リストのため飛ばします');
  uid = await testUserUid();
  restore = await stashProgress(uid, playlistId);
});

test.afterEach(async () => {
  await restore?.();
  restore = null;
});

test('端末内の控えが Firestore より新しければ、控えの位置から続きを再生する（再生時間の記録タイミング: 端末内の控え）', async ({ userPage }) => {
  const target = videoIds[videoIds.length - 1];
  // Firestore には古い位置（先頭の動画）、端末内にはより新しい位置（最後の動画の 120 秒）がある状態
  await setProgress(uid, playlistId, videoIds[0], 30, new Date(Date.now() - 60 * 60 * 1000));
  await userPage.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`puremite:watch-progress:${uid}:${playlistId}`, JSON.stringify({ youtubeVideoId: target, seconds: 120, at: Date.now() })],
  );
  await userPage.goto(`/playlists/${playlistId}`);
  await expect(userPage.getByRole('button', { name: '続きから再生する' }).first()).toBeVisible();
  // 控えの位置が Firestore に書き戻される
  await expect.poll(() => getProgressSeconds(uid, playlistId, target), { timeout: 15_000 }).toBe(120);
});

test('スリープから復帰したら、保存済みの位置を消さずにプレーヤーを作り直す（プレーヤーの不調からの復帰）', async ({ userPage }) => {
  await setProgress(uid, playlistId, videoIds[0], 120);
  await userPage.goto(`/playlists/${playlistId}`);
  await expect(userPage.getByRole('button', { name: '続きから再生する' }).first()).toBeVisible();
  const before = await playerIframe(userPage).elementHandle({ timeout: 30_000 });

  await simulateLongSleep(userPage);

  // 古い iframe が外され、新しいプレーヤーが入る
  await expect.poll(() => before!.evaluate((el) => el.isConnected), { timeout: 15_000 }).toBe(false);
  await expect(playerIframe(userPage)).toBeAttached({ timeout: 30_000 });
  await expect(userPage.getByRole('button', { name: '続きから再生する' }).first()).toBeVisible();
  // 復帰時の保存で 0 秒に上書きされていない
  await userPage.waitForTimeout(2_000);
  expect(await getProgressSeconds(uid, playlistId, videoIds[0])).toBe(120);

  // 再読み込みしても続きから再生できる
  await userPage.reload();
  await expect(userPage.getByRole('button', { name: '続きから再生する' }).first()).toBeVisible();
});

test('再生後に一時停止した位置が保存され、スリープ復帰後も残る（再生時間の記録タイミング: 一時停止）', async ({ userPage }) => {
  await setProgress(uid, playlistId, videoIds[0], 60);
  await userPage.goto(`/playlists/${playlistId}`);
  await playerIframe(userPage).waitFor({ state: 'attached', timeout: 30_000 });
  await userPage.getByRole('button', { name: '続きから再生する' }).last().click();
  // 再生が始まると「一時停止」ボタンに変わる（広告などで始まらない環境では飛ばす）
  const pause = userPage.getByRole('button', { name: '一時停止' });
  const started = await pause.waitFor({ timeout: 30_000 }).then(
    () => true,
    () => false,
  );
  test.skip(!started, 'stg のブラウザで YouTube の再生が始まらなかったため飛ばします');
  await userPage.waitForTimeout(4_000);
  await pause.click();
  await expect(userPage.getByRole('button', { name: '再生', exact: true })).toBeVisible();
  await expect.poll(() => getProgressSeconds(uid, playlistId, videoIds[0]), { timeout: 15_000 }).toBeGreaterThan(60);
  const paused = await getProgressSeconds(uid, playlistId, videoIds[0]);

  await simulateLongSleep(userPage);
  await userPage.waitForTimeout(3_000);
  expect(await getProgressSeconds(uid, playlistId, videoIds[0])).toBe(paused);

  await userPage.reload();
  await expect(userPage.getByRole('button', { name: '続きから再生する' }).first()).toBeVisible();
});
