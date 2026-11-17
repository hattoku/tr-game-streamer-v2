// 提案のステップ表示の見た目（共通 uiコンポーネント フロント 仕様書 §2.11 v2.8、ページ 再生リストを追加する 仕様書 §9.4 v6.2、
// ページ チャンネルを申請する 仕様書 v1.5）。「いまここ」の文字を出さず、丸の状態（済み・今の段・見送り・まだ）で進み具合を示す。
// 提案履歴に確認待ち・公開済み・見送りの提案と、確認待ちのチャンネル申請を直接作って確かめる。作ったデータは最後に消す。
import { expect, hasHorizontalScroll, test } from './support/fixtures';
import { TEST_USER_EMAILS, uniqueText } from './support/env';
import { db as e2eDb } from './support/cleanup';

async function uidOf(email: string): Promise<string> {
  const snap = await e2eDb().collection('users').where('email', '==', email).limit(1).get();
  if (snap.empty) throw new Error(`テスト用会員が見つかりません: ${email}`);
  return snap.docs[0].id;
}

test('§2.11 提案履歴のステップ表示は「いまここ」の文字なしで、丸の状態で今の段を示す', async ({ userPage }) => {
  const uid = await uidOf(TEST_USER_EMAILS.user);
  const now = Date.now();
  const titles = { reviewing: uniqueText('確認待ちの提案'), approved: uniqueText('公開済みの提案'), rejected: uniqueText('見送りの提案') };
  const channelName = uniqueText('確認待ちの申請');
  const ids: string[] = [];
  const add = async (data: Record<string, unknown>) => {
    const ref = e2eDb().collection('workflows').doc();
    ids.push(ref.id);
    await ref.set({ submittedBy: uid, step2History: [], submittedAt: new Date(now - ids.length * 1000), updatedAt: new Date(), ...data });
  };
  try {
    for (const status of ['reviewing', 'approved', 'rejected'] as const) {
      await add({
        type: 'playlist_register',
        status,
        proposalData: {
          title: titles[status], thumbnailUrl: '', channelName: uniqueText('チャンネル'), channelIconUrl: '', itemCount: 3,
          gameName: uniqueText('ゲーム'), rejectReasonCode: status === 'rejected' ? 'other' : null,
        },
      });
    }
    await add({ type: 'channel_application', status: 'reviewing', proposalData: { channelTitle: channelName, channelIconUrl: '', youtubeChannelId: '' } });

    await userPage.goto('/playlists/proposals');
    const stepsOf = (text: string) => userPage.locator('li, [data-testid="channel-application-card"]').filter({ hasText: text }).getByTestId('proposal-steps').first();
    const states = async (text: string) => stepsOf(text).locator('li').evaluateAll((els) => els.map((e) => e.getAttribute('data-state')));

    await expect(stepsOf(titles.reviewing)).toBeVisible();
    // 「いまここ」の文字はどこにも出さない
    await expect(userPage.getByText('いまここ')).toHaveCount(0);

    // 確認待ち: ①済み・②今の段（aria-current）・③まだ
    expect(await states(titles.reviewing)).toEqual(['done', 'current', 'upcoming']);
    await expect(stepsOf(titles.reviewing).locator('li[aria-current="step"]')).toContainText('運営が確認');
    // 公開済み: 最後の段まで済み（今の段の強調は無し）
    expect(await states(titles.approved)).toEqual(['done', 'done', 'done']);
    await expect(stepsOf(titles.approved).locator('li[aria-current="step"]')).toHaveCount(0);
    // 見送り: ②を「見送り」にして③は薄く
    expect(await states(titles.rejected)).toEqual(['done', 'rejected', 'upcoming']);
    await expect(stepsOf(titles.rejected).locator('li[data-state="rejected"]')).toContainText('見送り');
    // チャンネル申請も同じ見た目
    expect(await states(channelName)).toEqual(['done', 'current', 'upcoming']);
    await expect(stepsOf(channelName)).toContainText('チャンネルに公開');

    expect(await hasHorizontalScroll(userPage)).toBe(false);
  } finally {
    await Promise.all(ids.map((id) => e2eDb().collection('workflows').doc(id).delete()));
  }
});
