// お問い合わせの画像添付（2026-10-27）。ページ お問い合わせフォーム仕様書 §9・お問い合わせ履歴 仕様書 §4・
// 管理 お問い合わせ管理仕様書 §4.6/§6 の項目（plans/お問い合わせ画像添付-実装計画.md §8）をテストにする。
// 画像を保存するテストは desktop だけで流す。テスト用会員の1日の上限カウンターを書き換えるため、
// desktop と mobile で同時に動くと互いの送信が上限に当たってしまう（同じファイルのテストは1つのワーカーで順に動く）。
import sharp from 'sharp';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, captureIdToken, hasHorizontalScroll, test } from './support/fixtures';
import { uniqueText } from './support/env';
import { db } from './support/cleanup';

const png = () => sharp({ create: { width: 640, height: 360, channels: 3, background: '#3366cc' } }).png().toBuffer();
// 位置情報（GPS）とカメラ名を入れた JPEG。保存後に消えていることを確かめる
const jpegWithGps = () =>
  sharp({ create: { width: 800, height: 600, channels: 3, background: '#cc6633' } })
    .jpeg()
    .withExif({ IFD0: { Make: 'E2E-Camera' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '35/1 41/1 0/1' } })
    .toBuffer();

function uidOf(idToken: string): string {
  return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()).user_id;
}

function jstDateKey(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replaceAll('-', '');
}

async function fillContactForm(page: Page, body: string) {
  await page.goto('/contact');
  await page.getByRole('button', { name: 'お問い合わせ種別（必須）' }).click();
  await page.getByRole('menuitemradio', { name: '不具合・バグ報告' }).click();
  await page.getByLabel('お問い合わせ内容（必須）').fill(body);
}

async function postReply(api: APIRequestContext, inquiryId: string, token: string, image: { name: string; mimeType: string; buffer: Buffer }) {
  return api.post(`/api/inquiries/${inquiryId}`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: { payload: JSON.stringify({ action: 'reply', body: uniqueText('画像付きの返信') }), images: image },
  });
}

test('フォームと返信で画像を添付でき、本人と管理者だけが見られる（フォーム仕様書 §9・管理仕様書 §4.6）', async ({
  userPage,
  adminPage,
  guestPage,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '画像を保存するテストは desktop のみ（ファイル冒頭のコメント）');
  test.setTimeout(240_000);
  const body = uniqueText('画像添付のテスト');
  let inquiryId = '';

  await test.step('§9.3 フォームで画像を選ぶとサムネイルが出て、送信できる', async () => {
    await fillContactForm(userPage, body);
    await userPage.locator('input[type=file]').setInputFiles({ name: 'screenshot.png', mimeType: 'image/png', buffer: await png() });
    await expect(userPage.getByRole('img', { name: '選択した画像 1' })).toBeVisible();
    await userPage.getByRole('button', { name: '送信する' }).click();
    await expect(userPage.getByRole('heading', { name: 'お問い合わせを受け付けました' })).toBeVisible();

    await userPage.getByRole('link', { name: 'お問い合わせ履歴を見る' }).click();
    const item = userPage.getByRole('link').filter({ hasText: body });
    inquiryId = (await item.getAttribute('href'))!.split('/').pop()!;
  });

  await test.step('§9.6 本人のスレッドでサムネイルを押すと拡大表示され、ダウンロードボタンは無い', async () => {
    await userPage.goto(`/contact/history/${inquiryId}`);
    const thumb = userPage.getByRole('button', { name: '添付画像 1を拡大する' });
    await expect(thumb).toBeEnabled();
    await thumb.click();
    const dialog = userPage.getByRole('dialog');
    await expect(dialog.getByRole('img', { name: '添付画像 1' })).toBeVisible();
    await expect(dialog.getByText('ダウンロード')).toHaveCount(0);
    await userPage.keyboard.press('Escape');
  });

  await test.step('§4.6 管理画面の詳細にも同じ画像が出る', async () => {
    await adminPage.goto(`/admin/inquiries/${inquiryId}`);
    await expect(adminPage.getByRole('button', { name: '添付画像 1を拡大する' })).toBeEnabled();
  });

  await test.step('履歴 §4 スレッドの返信にも画像を添付できる', async () => {
    await userPage.goto(`/contact/history/${inquiryId}`);
    await userPage.getByLabel('メッセージ', { exact: true }).fill(uniqueText('返信'));
    await userPage.locator('input[type=file]').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: await jpegWithGps() });
    await userPage.getByRole('button', { name: '送信する' }).click();
    await expect(userPage.getByText('メッセージを送信しました')).toBeVisible();
    // お問い合わせ内容の1枚と、返信の1枚
    await expect(userPage.getByRole('button', { name: '添付画像 1を拡大する' })).toHaveCount(2);
  });

  const userToken = await captureIdToken(userPage, '/contact/history');
  const adminToken = await captureIdToken(adminPage, '/contact/history');
  const api = userPage.request;

  await test.step('§9.5 保存された画像は再エンコード済みで、位置情報などのメタデータが消えている', async () => {
    const detail = await (await api.get(`/api/inquiries/${inquiryId}`, { headers: { Authorization: `Bearer ${userToken}` } })).json();
    const attachment = detail.inquiry.messages[0].attachments[0];
    expect(attachment.format).toBe('jpeg');
    const res = await api.get(`/api/inquiries/${inquiryId}/attachments/${attachment.id}.jpg`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status()).toBe(200);
    const meta = await sharp(await res.body()).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
    expect((await res.body()).includes(Buffer.from('E2E-Camera'))).toBe(false);
  });

  await test.step('§9.6 閲覧 API は本人と管理者のみ。ヘッダーで型を固定する', async () => {
    const detail = await (await api.get(`/api/inquiries/${inquiryId}`, { headers: { Authorization: `Bearer ${userToken}` } })).json();
    const file = `${detail.inquiry.attachments[0].id}.png`;
    const own = await api.get(`/api/inquiries/${inquiryId}/attachments/${file}`, { headers: { Authorization: `Bearer ${userToken}` } });
    expect(own.status()).toBe(200);
    expect(own.headers()['content-type']).toBe('image/png');
    expect(own.headers()['x-content-type-options']).toBe('nosniff');
    expect(own.headers()['content-security-policy']).toBe("default-src 'none'");
    expect(own.headers()['cache-control']).toContain('no-store');

    // 管理者でも本人用 API では他人扱い（404）。管理者用 API なら見られ、一般ユーザーは管理者用 API を使えない
    expect((await api.get(`/api/inquiries/${inquiryId}/attachments/${file}`, { headers: { Authorization: `Bearer ${adminToken}` } })).status()).toBe(404);
    expect((await api.get(`/api/admin/inquiries/${inquiryId}/attachments/${file}`, { headers: { Authorization: `Bearer ${adminToken}` } })).status()).toBe(200);
    expect((await api.get(`/api/admin/inquiries/${inquiryId}/attachments/${file}`, { headers: { Authorization: `Bearer ${userToken}` } })).status()).toBe(403);
    expect((await api.get(`/api/inquiries/${inquiryId}/attachments/${file}`)).status()).toBe(401);
    // Storage を直接読むことはできない（storage.rules で全拒否）
    const direct = await api.get(
      `https://firebasestorage.googleapis.com/v0/b/tr-game-streamer-stg.firebasestorage.app/o/${encodeURIComponent(`inquiries/${inquiryId}/${file}`)}?alt=media`,
    );
    expect([401, 403]).toContain(direct.status());
  });

  await test.step('§9.5 拡張子と MIME だけ画像のファイルは中身で判定して弾く', async () => {
    const res = await postReply(api, inquiryId, userToken, { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<html><script>alert(1)</script></html>') });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('attachment_type');
  });

  await test.step('§9.1 ゲストのフォームには添付欄が無く、API もゲストの添付を拒否する', async () => {
    await guestPage.goto('/contact');
    await expect(guestPage.getByLabel('お問い合わせ内容（必須）')).toBeVisible();
    await expect(guestPage.getByRole('button', { name: '画像を追加する' })).toHaveCount(0);
    const res = await guestPage.request.post('/api/inquiries', {
      multipart: {
        payload: JSON.stringify({ category: 'bug', body: uniqueText('ゲストの添付'), relatedUrls: [], email: 'e2e@example.com' }),
        images: { name: 'a.png', mimeType: 'image/png', buffer: await png() },
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('attachment_guest');
  });

  await test.step('§9.2 1日の上限（20枚）を超える添付は 429 で拒否し、返信も保存しない', async () => {
    const counter = db().collection('inquiry_upload_counters').doc(`${uidOf(userToken)}_${jstDateKey()}`);
    const before = (await counter.get()).data();
    await counter.set({ userId: uidOf(userToken), date: jstDateKey(), count: 20, updatedAt: new Date() });
    try {
      const messagesBefore = (await db().collection('inquiries').doc(inquiryId).collection('messages').get()).size;
      const res = await postReply(api, inquiryId, userToken, { name: 'a.png', mimeType: 'image/png', buffer: await png() });
      expect(res.status()).toBe(429);
      expect((await res.json()).error).toBe('attachment_daily_limit');
      expect((await db().collection('inquiries').doc(inquiryId).collection('messages').get()).size).toBe(messagesBefore);
    } finally {
      if (before) await counter.set(before);
      else await counter.delete();
    }
  });

  await test.step('管理仕様書 §6 対応済みから180日を過ぎた画像は削除され、「保存期間を過ぎたため削除しました」と出る', async () => {
    await db()
      .collection('inquiries')
      .doc(inquiryId)
      .update({ status: 'resolved', resolvedAt: new Date(Date.now() - 181 * 24 * 60 * 60 * 1000) });
    const res = await adminPage.request.post('/api/admin/inquiries/purge-attachments', { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(res.status()).toBe(200);
    expect((await res.json()).inquiries).toBeGreaterThanOrEqual(1);

    await userPage.goto(`/contact/history/${inquiryId}`);
    await expect(userPage.getByText('保存期間を過ぎたため削除しました')).toHaveCount(2);
    await expect(userPage.getByRole('button', { name: '添付画像 1を拡大する' })).toHaveCount(0);
  });
});

test('§9.4 形式・サイズ・枚数はファイルを選んだ時点で弾く（画面幅ごと）', async ({ userPage }) => {
  await userPage.goto('/contact');
  const input = userPage.locator('input[type=file]');
  await expect(userPage.getByRole('button', { name: '画像を追加する' })).toBeVisible();
  expect(await hasHorizontalScroll(userPage)).toBe(false);

  await input.setInputFiles({ name: 'a.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await expect(userPage.getByText('PNG・JPEG・WebP の画像を選択してください')).toBeVisible();

  await input.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(userPage.getByText('1枚5MB以内の画像を選択してください')).toBeVisible();

  const small = await png();
  await input.setInputFiles([1, 2, 3, 4].map((i) => ({ name: `${i}.png`, mimeType: 'image/png', buffer: small })));
  await expect(userPage.getByText('画像は3枚まで添付できます')).toBeVisible();

  await input.setInputFiles([1, 2, 3].map((i) => ({ name: `${i}.png`, mimeType: 'image/png', buffer: small })));
  await expect(userPage.getByRole('img', { name: /^選択した画像/ })).toHaveCount(3);
  // 3枚に達したら追加ボタンを隠す（§9.3）
  await expect(userPage.getByRole('button', { name: '画像を追加する' })).toHaveCount(0);
  expect(await hasHorizontalScroll(userPage)).toBe(false);
});
