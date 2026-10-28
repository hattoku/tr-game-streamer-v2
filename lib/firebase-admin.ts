import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { IS_PROD } from './app-env';

// サーバー専用（API Routeからのみimportすること）。クライアントコンポーネントに
// 混入させないこと。認証はApplication Default Credentialsを利用する
// （scripts/lib/firebase-admin.mjsと同じ方針。理由はwiki/concepts/マスタデータ投入方針.md参照）。
// Cloud Run上ではアタッチされたサービスアカウントの認証情報が自動的に使われ、
// ローカル開発では`gcloud auth application-default login`済みの認証情報が使われる。
// 接続先は lib/app-env.ts の判定に従う（明示的に prod と指定しない限りステージング）
const projectId = IS_PROD ? 'tr-game-streamer' : 'tr-game-streamer-stg';

// Cloud Storage はお問い合わせの添付画像だけに使う（lib/inquiry-attachments-server.ts）。バケットは Firebase のデフォルトバケット
const storageBucket = `${projectId}.firebasestorage.app`;

export const adminApp = getApps().length === 0
  ? initializeApp({ credential: applicationDefault(), projectId, storageBucket })
  : getApps()[0];

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
