// 視聴進捗（watch_progress・watch_history）の下準備（Admin SDK）。テスト用会員の進捗をテストの前に退避し、
// 後で元に戻す（stg を手で触って付いた進捗を消さないため）。接続先は stg 固定（cleanup.ts の db()）。
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './cleanup';
import { TEST_USER_EMAILS } from './env';

export async function testUserUid(): Promise<string> {
  const snap = await db().collection('users').where('email', '==', TEST_USER_EMAILS.user).where('isTestUser', '==', true).limit(1).get();
  if (snap.empty) throw new Error('テスト用会員（一般ユーザー）の users ドキュメントがありません');
  return snap.docs[0].id;
}

export async function playlistVideoIds(playlistId: string): Promise<string[]> {
  const snap = await db().collection('videos').where('playlistId', '==', playlistId).orderBy('position', 'asc').get();
  return snap.docs.map((d) => d.data().youtubeVideoId as string);
}

type Saved = { path: string; data: FirebaseFirestore.DocumentData }[];

/** この再生リストのテスト用会員の進捗を退避して消す。戻すときは restore を呼ぶ */
export async function stashProgress(uid: string, playlistId: string): Promise<() => Promise<void>> {
  const firestore = db();
  const saved: Saved = [];
  for (const collection of ['watch_progress', 'watch_history']) {
    const snap = await firestore.collection(collection).where('userId', '==', uid).where('playlistId', '==', playlistId).get();
    for (const d of snap.docs) {
      saved.push({ path: d.ref.path, data: d.data() });
      await d.ref.delete();
    }
  }
  return async () => {
    for (const collection of ['watch_progress', 'watch_history']) {
      const snap = await firestore.collection(collection).where('userId', '==', uid).where('playlistId', '==', playlistId).get();
      for (const d of snap.docs) await d.ref.delete();
    }
    for (const s of saved) await firestore.doc(s.path).set(s.data);
  };
}

export async function setProgress(uid: string, playlistId: string, youtubeVideoId: string, seconds: number, updatedAt = new Date()) {
  await db()
    .doc(`watch_progress/${uid}_${playlistId}_${youtubeVideoId}`)
    .set({ userId: uid, playlistId, youtubeVideoId, lastPlayedSeconds: seconds, updatedAt: Timestamp.fromDate(updatedAt) });
}

export async function getProgressSeconds(uid: string, playlistId: string, youtubeVideoId: string): Promise<number | null> {
  const snap = await db().doc(`watch_progress/${uid}_${playlistId}_${youtubeVideoId}`).get();
  return snap.exists ? (snap.data()!.lastPlayedSeconds as number) : null;
}
