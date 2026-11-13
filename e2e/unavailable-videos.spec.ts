// 削除・非公開の動画と、再生リストから消えた動画の扱い。共通 YouTube定期取得仕様書 v1.10 §7.2 の確認項目。
// 再取得は stg 全体に効くため desktop だけで実行する（refresh-new-videos.spec.ts と同じ）。
// - 「消えた動画のドキュメントを消す」: stg の実在の再生リスト（マイリスト登録の無いもの）に、YouTube に無い動画IDの
//   ドキュメント（タイトル「Deleted video」）を足し、前回の動画数の記録をずらして取り直させる
// - 「非公開の動画を取り込まない」: YouTube 上で非公開の動画（Private video）を含む実在の再生リストを取り直させる。
//   stg に無い・YouTube 側で非公開の動画が無くなった場合も、Private video のドキュメントが残らないことは確かめられる
import type { Page } from '@playwright/test';
import type { DocumentReference, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { expect, test } from './support/fixtures';
import { db as e2eDb } from './support/cleanup';

test.describe.configure({ mode: 'serial' });

/** 2026-11-13 時点で3本目が非公開（Private video）の再生リスト（スプラトゥーン3、238本） */
const PLAYLIST_WITH_PRIVATE_VIDEO = 'PLOZOho2RXG3xI7DuIuwHVHq5eQPKFUHAd';
const FAKE_VIDEO_ID = 'E2Edeleted1';

async function runRefresh(page: Page) {
  await page.goto('/admin');
  await expect(page.getByText(/最終実行:|実行履歴はまだありません/)).toBeVisible();
  const response = page.waitForResponse((r) => r.url().includes('/api/admin/refresh-new-videos'), { timeout: 240_000 });
  await page.getByRole('button', { name: '新着動画を再取得' }).click();
  const res = await response;
  expect(res.status()).toBe(200);
  await expect(page.getByText(/^完了しました/)).toBeVisible();
  return res.json();
}

/** マイリスト登録が無く、取り直しの対象（channel_off 以外）で、動画が2本以上ある再生リスト */
async function pickRealPlaylist(): Promise<QueryDocumentSnapshot> {
  const snap = await e2eDb().collection('playlists').where('listingStatus', '==', 'listed').get();
  for (const d of snap.docs) {
    if (d.id.startsWith('PLE2E') || d.id === PLAYLIST_WITH_PRIVATE_VIDEO) continue;
    if ((d.data().videoCount ?? 0) < 2 || d.data().youtubeItemCount == null) continue;
    const mylist = await e2eDb().collection('mylist').where('playlistId', '==', d.id).limit(1).get();
    if (mylist.empty) return d;
  }
  throw new Error('マイリスト登録の無い掲載中の再生リストが stg にありません');
}

/** 動画の position が 0 から隙間・重なりなく並び、videoCount と同じ本数か */
async function expectContiguousPositions(playlistRef: DocumentReference) {
  const videos = await e2eDb().collection('videos').where('playlistId', '==', playlistRef.id).get();
  const positions = videos.docs.map((v) => v.data().position as number).sort((a, b) => a - b);
  expect(positions).toEqual(positions.map((_, i) => i));
  expect((await playlistRef.get()).data()!.videoCount).toBe(videos.size);
  return videos;
}

test('§7.2 再生リストから消えた動画は取り直しで消え、削除・非公開の動画は取り込まず、話数は0から詰まる', async ({ adminPage, guestPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '再取得は stg 全体に効くため desktop だけで実行する');
  test.setTimeout(480_000);

  const playlist = await pickRealPlaylist();
  const before = playlist.data();
  const fakeRef = e2eDb().collection('videos').doc(`${playlist.id}_${FAKE_VIDEO_ID}`);
  await fakeRef.set({
    youtubeVideoId: FAKE_VIDEO_ID,
    playlistId: playlist.id,
    position: 1,
    title: 'Deleted video',
    thumbnailUrl: '',
    durationSeconds: null,
    publishedAt: new Date(),
    playStartCount: 0,
  });

  const privateRef = e2eDb().collection('playlists').doc(PLAYLIST_WITH_PRIVATE_VIDEO);
  const privateDoc = await privateRef.get();
  const privateTarget = privateDoc.exists && privateDoc.data()!.listingStatus !== 'channel_off' && privateDoc.data()!.youtubeItemCount != null;
  const privateBefore = privateDoc.data()?.youtubeItemCount;

  // 前回の動画数の記録をずらす（YouTube 側の数と違う＝変わった扱いにして取り直させる）
  await playlist.ref.update({ youtubeItemCount: -1 });
  if (privateTarget) await privateRef.update({ youtubeItemCount: -1 });

  try {
    await runRefresh(adminPage);

    // 消えた動画のドキュメントが消え、話数が詰まっている
    expect((await fakeRef.get()).exists).toBe(false);
    await expectContiguousPositions(playlist.ref);
    expect((await playlist.ref.get()).data()!.youtubeItemCount).not.toBe(-1);

    // 画面に「Deleted video」が出ない
    await guestPage.goto(`/playlists/${playlist.id}`);
    await expect(guestPage.getByRole('heading', { name: before.title }).first()).toBeVisible();
    await expect(guestPage.getByText('Deleted video')).toHaveCount(0);

    if (privateTarget) {
      const videos = await expectContiguousPositions(privateRef);
      expect(videos.docs.filter((v) => v.data().title === 'Private video' || v.data().title === 'Deleted video')).toEqual([]);
    }
  } finally {
    if ((await fakeRef.get()).exists) await fakeRef.delete();
    if ((await playlist.ref.get()).data()!.youtubeItemCount === -1) await playlist.ref.update({ youtubeItemCount: before.youtubeItemCount });
    if (privateTarget && (await privateRef.get()).data()!.youtubeItemCount === -1) await privateRef.update({ youtubeItemCount: privateBefore });
  }
});
