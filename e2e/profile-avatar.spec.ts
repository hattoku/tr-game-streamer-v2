// ユーザーアイコンの設定（2026-11-16）。ページ 設定 プロフィール仕様書 §4.2・§9.2・§9.4・§9.5 の項目をテストにする。
// アイコンを書き換えるテストは desktop だけで流す（テスト用会員は全プロジェクトで共通のため、同時に動くと互いの画像を消し合う）。
// 始める前と終わった後にアイコンを外し、テスト用会員を未設定に戻す。
import sharp from 'sharp';
import type { APIRequestContext } from '@playwright/test';
import { expect, captureIdToken, hasHorizontalScroll, test } from './support/fixtures';

// 横長の画像（中央で正方形に切り抜かれることを確かめる）。位置情報入りの JPEG はメタデータが消えることを確かめる
const widePng = () => sharp({ create: { width: 900, height: 300, channels: 3, background: '#3366cc' } }).png().toBuffer();
const jpegWithGps = () =>
  sharp({ create: { width: 400, height: 400, channels: 3, background: '#cc6633' } })
    .jpeg()
    .withExif({ IFD0: { Make: 'E2E-Camera' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '35/1 41/1 0/1' } })
    .toBuffer();

function uidOf(idToken: string): string {
  return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()).user_id;
}

async function removeAvatar(api: APIRequestContext, uid: string, token: string) {
  const res = await api.delete(`/api/users/${uid}/avatar`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status()).toBe(200);
}

test('アイコン未設定は人物シルエットを出す（プロフィール仕様書 §4.2）', async ({ userPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'アイコンを書き換えるテストは desktop のみ（ファイル冒頭のコメント）');
  const token = await captureIdToken(userPage, '/contact/history');
  const uid = uidOf(token);
  await removeAvatar(userPage.request, uid, token);

  await userPage.goto(`/profile/${uid}`);
  await expect(userPage.getByTestId('user-avatar-silhouette').first()).toBeVisible();
  // ヘッダーのユーザーメニューも同じシルエット（頭文字は出さない）
  const trigger = userPage.getByRole('button', { name: /ユーザーメニュー/ });
  await expect(trigger.getByTestId('user-avatar-silhouette')).toBeVisible();
});

test('プロフィール編集で画像を選んで保存すると、アイコンが変わり外すこともできる（§9.2・§9.5）', async ({ userPage, guestPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'アイコンを書き換えるテストは desktop のみ（ファイル冒頭のコメント）');
  test.setTimeout(120_000);
  const token = await captureIdToken(userPage, '/contact/history');
  const uid = uidOf(token);
  const api = userPage.request;
  await removeAvatar(api, uid, token);
  let firstUrl = '';

  try {
    await test.step('§9.2 画像を選ぶとプレビューが出て、保存するとプロフィールとヘッダーのアイコンが変わる', async () => {
      await userPage.goto(`/profile/${uid}`);
      await userPage.getByRole('button', { name: '編集する' }).click();
      await userPage.getByTestId('profile-image-input').setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: await widePng() });
      await expect(userPage.getByTestId('profile-image-preview')).toBeVisible();
      await userPage.getByRole('button', { name: '保存する' }).click();
      await expect(userPage.getByText('プロフィールを保存しました')).toBeVisible();

      const avatar = userPage.getByTestId('user-avatar-image').first();
      await expect(avatar).toBeVisible();
      firstUrl = (await avatar.getAttribute('src'))!;
      expect(firstUrl).toMatch(new RegExp(`^/api/users/${uid}/avatar/[A-Za-z0-9]{20}\\.webp$`));
      const trigger = userPage.getByRole('button', { name: /ユーザーメニュー/ });
      await expect(trigger.getByTestId('user-avatar-image')).toHaveAttribute('src', firstUrl);
    });

    await test.step('§9.5 保存された画像は中央で切り抜いた 256×256 の WebP で、ログインしていなくても見られる', async () => {
      const res = await guestPage.request.get(firstUrl);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toBe('image/webp');
      const meta = await sharp(await res.body()).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['webp', 256, 256]);
    });

    await test.step('§9.5 他の人のページから見てもアイコンが出る', async () => {
      await guestPage.goto(`/profile/${uid}`);
      await expect(guestPage.getByTestId('user-avatar-image').first()).toHaveAttribute('src', firstUrl);
    });

    await test.step('§9.5 画像を替えると前の URL は見られなくなり、位置情報などのメタデータは残らない', async () => {
      const res = await api.put(`/api/users/${uid}/avatar`, {
        headers: { Authorization: `Bearer ${token}` },
        multipart: { image: { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: await jpegWithGps() } },
      });
      expect(res.status()).toBe(200);
      const { profileImageUrl } = await res.json();
      expect(profileImageUrl).not.toBe(firstUrl);
      expect((await api.get(firstUrl)).status()).toBe(404);
      const meta = await sharp(await (await api.get(profileImageUrl)).body()).metadata();
      expect(meta.exif).toBeUndefined();
    });

    await test.step('§9.2 「画像を外す」で保存するとシルエットに戻る', async () => {
      await userPage.goto(`/profile/${uid}`);
      await userPage.getByRole('button', { name: '編集する' }).click();
      await userPage.getByRole('button', { name: '画像を外す' }).click();
      await userPage.getByRole('button', { name: '保存する' }).click();
      await expect(userPage.getByText('プロフィールを保存しました')).toBeVisible();
      await expect(userPage.getByTestId('user-avatar-silhouette').first()).toBeVisible();
      await expect(userPage.getByRole('button', { name: /ユーザーメニュー/ }).getByTestId('user-avatar-silhouette')).toBeVisible();
    });
  } finally {
    await api.delete(`/api/users/${uid}/avatar`, { headers: { Authorization: `Bearer ${token}` } });
  }
});

test('対応外の形式・大きすぎる画像は保存できない（§9.4）', async ({ userPage, adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'アイコンを書き換えるテストは desktop のみ（ファイル冒頭のコメント）');
  const token = await captureIdToken(userPage, '/contact/history');
  const adminToken = await captureIdToken(adminPage, '/contact/history');
  const uid = uidOf(token);
  const api = userPage.request;

  await test.step('画面: GIF を選ぶとエラーを出し、プレビューしない', async () => {
    await userPage.goto(`/profile/${uid}`);
    await userPage.getByRole('button', { name: '編集する' }).click();
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).gif().toBuffer();
    await userPage.getByTestId('profile-image-input').setInputFiles({ name: 'a.gif', mimeType: 'image/gif', buffer: gif });
    await expect(userPage.getByRole('alert').filter({ hasText: 'PNG・JPEG・WebP の画像を選択してください' })).toBeVisible();
    await expect(userPage.getByTestId('profile-image-preview')).toHaveCount(0);
  });

  await test.step('画面: 5MB を超える画像を選ぶとエラーを出す', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    await userPage.getByTestId('profile-image-input').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: big });
    await expect(userPage.getByRole('alert').filter({ hasText: '5MB以内の画像を選択してください' })).toBeVisible();
  });

  await test.step('API: 拡張子・MIME を偽った画像でないファイルは中身で弾く', async () => {
    const res = await api.put(`/api/users/${uid}/avatar`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { image: { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') } },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('image_type');
  });

  await test.step('API: 他人のアイコンは変えられない', async () => {
    const res = await api.put(`/api/users/${uid}/avatar`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: { image: { name: 'a.png', mimeType: 'image/png', buffer: await widePng() } },
    });
    expect(res.status()).toBe(403);
    expect((await api.delete(`/api/users/${uid}/avatar`, { headers: { Authorization: `Bearer ${adminToken}` } })).status()).toBe(403);
  });
});

test('編集フォームのアイコン欄は横にはみ出さない（390・768・1440px）', async ({ userPage }) => {
  const token = await captureIdToken(userPage, '/contact/history');
  await userPage.goto(`/profile/${uidOf(token)}`);
  await userPage.getByRole('button', { name: '編集する' }).click();
  await expect(userPage.getByRole('button', { name: /画像を(選ぶ|変更)/ })).toBeVisible();
  expect(await hasHorizontalScroll(userPage)).toBe(false);
});
