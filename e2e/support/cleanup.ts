// テストデータの後始末（Admin SDK）。テスト用会員（users.isTestUser == true）が持ち主で、本文が E2E_MARK で始まる
// お問い合わせを、メッセージ（サブコレクション）・返信通知・添付画像（Storage）ごと削除する。手で作ったデータは対象にしない。
// テスト用会員の画像添付の1日の上限カウンター（inquiry_upload_counters）も消す（実行を繰り返しても上限に当たらないように）。
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
    const batch = firestore.batch();
    counters.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return { inquiries, notifications };
}
