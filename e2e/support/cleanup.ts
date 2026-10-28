// テストデータの後始末（Admin SDK）。テスト用会員（users.isTestUser == true）が持ち主で、本文が E2E_MARK で始まる
// お問い合わせを、メッセージ（サブコレクション）・返信通知ごと削除する。手で作ったデータは対象にしない。
// あわせて、収集候補のテスト（e2e/collection-approve.spec.ts）が作った、再生リストタイトルが E2E_MARK で始まる
// collection_candidates と、タイトルが E2E_MARK で始まり再生リストの無い games を削除する。
// 認証は GOOGLE_APPLICATION_CREDENTIALS（stg 用サービスアカウント。roles/datastore.user）。接続先は stg 固定。
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { E2E_MARK, STG_PROJECT_ID } from './env';

function db() {
  const app =
    getApps().find((a) => a.name === 'e2e-cleanup') ??
    initializeApp({ credential: applicationDefault(), projectId: STG_PROJECT_ID }, 'e2e-cleanup');
  return getFirestore(app);
}

export function e2eDb() {
  return db();
}

/** 指定フィールドが E2E_MARK で始まるドキュメント */
async function startsWithMark(collectionName: string, field: string) {
  return db().collection(collectionName).where(field, '>=', E2E_MARK).where(field, '<', `${E2E_MARK}\uf8ff`).get();
}

async function cleanupCollectionData(): Promise<{ candidates: number; games: number }> {
  const candidates = await startsWithMark('collection_candidates', 'playlistTitle');
  const games = (await startsWithMark('games', 'title')).docs.filter((d) => !d.data().playlistCount);
  const refs = [...candidates.docs, ...games].map((d) => d.ref);
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
      // messages サブコレクションも含めて消す
      await firestore.recursiveDelete(inquiry.ref);
      inquiries += 1;
    }
  }
  return { inquiries, notifications, ...(await cleanupCollectionData()) };
}
