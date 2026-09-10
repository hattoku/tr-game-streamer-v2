import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// サーバー専用（API Routeからのみimportすること）。クライアントコンポーネントに
// 混入させないこと。認証はApplication Default Credentialsを利用する
// （scripts/lib/firebase-admin.mjsと同じ方針。理由はwiki/concepts/マスタデータ投入方針.md参照）。
// Cloud Run上ではアタッチされたサービスアカウントの認証情報が自動的に使われ、
// ローカル開発では`gcloud auth application-default login`済みの認証情報が使われる。
const isStg = process.env.NEXT_PUBLIC_APP_ENV === 'stg';
const projectId = isStg ? 'tr-game-streamer-stg' : 'tr-game-streamer';

const app = getApps().length === 0
  ? initializeApp({ credential: applicationDefault(), projectId })
  : getApps()[0];

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
