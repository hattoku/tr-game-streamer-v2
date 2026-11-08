// テストデータの後始末（Admin SDK）。テスト用会員（users.isTestUser == true）が持ち主で、本文が E2E_MARK で始まる
// お問い合わせを、メッセージ（サブコレクション）・返信通知・添付画像（Storage）ごと削除する。手で作ったデータは対象にしない。
// テスト用会員の画像添付の1日の上限カウンター（inquiry_upload_counters）も消す（実行を繰り返しても上限に当たらないように）。
// テスト用会員の playlist_viewers（人気の集計が視聴から作る記録）も消す。
// あわせて、再生リストタイトルが E2E_MARK で始まる
// collection_candidates と、タイトルが E2E_MARK で始まり再生リストの無い games、新着取得のテストが作った
// ID が PLE2E で始まる playlists を削除する。
// 認証は GOOGLE_APPLICATION_CREDENTIALS（stg 用サービスアカウント。roles/datastore.user）。接続先は stg 固定。
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { E2E_MARK, STG_PROJECT_ID } from './env';

function app() {
  return (
    getApps().find((a) => a.name === 'e2e-cleanup') ??
    initializeApp(
      { credential: applicationDefault(), projectId: STG_PROJECT_ID, storageBucket: `${STG_PROJECT_ID}.firebasestorage.app` },
      'e2e-cleanup',
    )
  );
}

/** テストからデータを直接書き換えるとき（保存期間・1日の上限の確認）にも使う */
export function db() {
  return getFirestore(app());
}

/** 指定フィールドが E2E_MARK で始まるドキュメント */
async function startsWithMark(collectionName: string, field: string) {
  return db().collection(collectionName).where(field, '>=', E2E_MARK).where(field, '<', `${E2E_MARK}\uf8ff`).get();
}

async function cleanupCollectionData(): Promise<{ candidates: number; games: number }> {
  const candidates = await startsWithMark('collection_candidates', 'playlistTitle');
  const games = (await startsWithMark('games', 'title')).docs.filter((d) => !d.data().playlistCount);
  // 新着取得のテスト（e2e/refresh-new-videos.spec.ts）が作った、YouTube に無い再生リスト
  const playlists = (await startsWithMark('playlists', 'title')).docs.filter((d) => d.id.startsWith('PLE2E'));
  // 掲載状態のテスト（e2e/listing-status.spec.ts）が作った、名前が E2E_MARK で始まり ID が UCE2E で始まる channels
  const channels = (await startsWithMark('channels', 'name')).docs.filter((d) => d.id.startsWith('UCE2E'));
  // チャンネル申請のテスト（e2e/channel-application.spec.ts）が作った、ID が UCE2E のチャンネルの申請・掲載チャンネル
  const exploration = (await db().collection('exploration_channels').get()).docs.filter((d) => String(d.data().youtubeChannelId ?? '').startsWith('UCE2E'));
  const applications = (await db().collection('workflows').where('type', '==', 'channel_application').get()).docs.filter((d) =>
    String(d.data().proposalData?.youtubeChannelId ?? '').startsWith('UCE2E'),
  );
  // 自動掲載のテスト（e2e/listing-collection.spec.ts）が作った、名前が E2E_MARK で始まる掲載チャンネル
  const explorationChannels = await startsWithMark('exploration_channels', 'name');
  // 人気の集計のテスト（e2e/popular-channels.spec.ts）が架空の利用者ID（e2e-pop- で始まる）で作った記録。途中で落ちたときの残り
  const popularity = (
    await Promise.all(
      ['mylist', 'reviews', 'watch_history', 'playlist_viewers'].map((c) => db().collection(c).where('userId', '>=', 'e2e-pop-').where('userId', '<', 'e2e-pop-\uf8ff').get()),
    )
  ).flatMap((s) => s.docs);
  const refs = [...candidates.docs, ...games, ...playlists, ...channels, ...exploration, ...applications, ...explorationChannels.docs, ...popularity].map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db().batch();
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  return { candidates: candidates.size, games: games.length };
}

export async function cleanupE2eData(): Promise<{ inquiries: number; notifications: number; candidates: number; games: number }> {
  const firestore = db();
  const testUsers = await firestore.collection('users').where('isTestUser', '==', true).get();
  let inquiries = 0;
  let notifications = 0;

  for (const user of testUsers.docs) {
    const snap = await firestore.collection('inquiries').where('userId', '==', user.id).get();
    for (const inquiry of snap.docs) {
      const body = inquiry.data().body;
      if (typeof body !== 'string' || !body.startsWith(E2E_MARK)) continue;
      const related = await firestore.collection('notifications').where('inquiryId', '==', inquiry.id).get();
      const batch = firestore.batch();
      related.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      notifications += related.size;
      // 添付画像。後始末用の SA に Storage の権限が無い場合は残る（閲覧 API はお問い合わせが無ければ 404 を返すので見えない）
      await getStorage(app())
        .bucket()
        .deleteFiles({ prefix: `inquiries/${inquiry.id}/` })
        .catch((e: unknown) => console.warn(`[e2e] 添付画像を削除できませんでした（${inquiry.id}）: ${String(e)}`));
      // messages サブコレクションも含めて消す
      await firestore.recursiveDelete(inquiry.ref);
      inquiries += 1;
    }
    const counters = await firestore.collection('inquiry_upload_counters').where('userId', '==', user.id).get();
    // 人気の集計（共通 人気のチャンネル 集計 仕様書 §2.3）がテスト用会員の視聴から作った「見始めた」記録。
    // 残すと stg のチャンネルの人気の数字がテストの視聴で増える
    const viewers = await firestore.collection('playlist_viewers').where('userId', '==', user.id).get();
    const batch = firestore.batch();
    [...counters.docs, ...viewers.docs].forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return { inquiries, notifications, ...(await cleanupCollectionData()) };
}
