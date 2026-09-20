import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// プロジェクトIDの対応は .firebaserc の projects エイリアスと同一にする。
const PROJECT_IDS = {
  prod: 'tr-game-streamer',
  stg: 'tr-game-streamer-stg',
};

function getApp(target) {
  const projectId = PROJECT_IDS[target];
  if (!projectId) {
    throw new Error(`unknown target "${target}". expected "prod" or "stg".`);
  }
  const app = getApps().length === 0
    ? initializeApp({ credential: applicationDefault(), projectId })
    : getApps()[0];
  return { app, projectId };
}

/**
 * Admin SDKを初期化しFirestoreインスタンスを返す。
 * 認証はApplication Default Credentials（`gcloud auth application-default login`、
 * または GOOGLE_APPLICATION_CREDENTIALS 環境変数）を利用する。サービスアカウント鍵の
 * JSONファイルをリポジトリに置く運用にはしない（firestore.rulesをバイパスできる
 * 強い権限のため、他の秘密情報と同じ「ソースに直書き」方針の対象外とする）。
 * @param {"prod"|"stg"} target
 */
export function initFirestore(target) {
  const { app, projectId } = getApp(target);
  return { db: getFirestore(app), projectId };
}

/**
 * Admin SDKを初期化しAuthインスタンスを返す（initFirestoreと同じ認証方式）。
 * @param {"prod"|"stg"} target
 */
export function initAuth(target) {
  const { app, projectId } = getApp(target);
  return { auth: getAuth(app), projectId };
}
