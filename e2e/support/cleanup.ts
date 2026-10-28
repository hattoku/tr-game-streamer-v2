// テストデータの後始末（Admin SDK）。テスト用会員（users.isTestUser == true）が持ち主で、本文が E2E_MARK で始まる
// お問い合わせを、メッセージ（サブコレクション）・返信通知ごと削除する。手で作ったデータは対象にしない。
// 認証は GOOGLE_APPLICATION_CREDENTIALS（stg 用サービスアカウント。roles/datastore.user）。接続先は stg 固定。
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { E2E_MARK, STG_PROJECT_ID } from './env';

/** stg の Firestore（Admin SDK）。後始末以外のテストの下準備にも使う */
export function db() {
  const app =
    getApps().find((a) => a.name === 'e2e-cleanup') ??
    initializeApp({ credential: applicationDefault(), projectId: STG_PROJECT_ID }, 'e2e-cleanup');
  return getFirestore(app);
}

export async function cleanupE2eData(): Promise<{ inquiries: number; notifications: number }> {
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
  return { inquiries, notifications };
}
