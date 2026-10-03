import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, setLogLevel } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { IS_PROD } from './app-env';

// 接続先は lib/app-env.ts の判定に従う（明示的に prod と指定しない限りステージング）。
// Firebase Webアプリ設定は SECRET_MANAGEMENT.md の方針どおりここに直書きし、環境変数による上書きは
// 行わない（以前は NEXT_PUBLIC_FIREBASE_* / NEXT_PUBLIC_STG_FIREBASE_* で上書きできたが、
// .env.local に旧Webアプリ登録の appId が残るなど設定源が二重化してドリフトしていたため廃止）。
// これらは公開識別子であり、アクセス制御は firestore.rules 側で行う。
const firebaseConfig = !IS_PROD ? {
    apiKey: "AIzaSyB_HmS-y7rgzDYVQMAryn5Ugbmsxrjmb5Y",
    authDomain: "tr-game-streamer-stg.firebaseapp.com",
    projectId: "tr-game-streamer-stg",
    storageBucket: "tr-game-streamer-stg.firebasestorage.app",
    messagingSenderId: "562598531589",
    appId: "1:562598531589:web:533c79bc648ed9d10d426c",
} : {
    apiKey: "AIzaSyACkJL3u4O5R3jsO8U_2HxNv2CfdH4hI1w",
    authDomain: "tr-game-streamer.firebaseapp.com",
    projectId: "tr-game-streamer",
    storageBucket: "tr-game-streamer.firebasestorage.app",
    messagingSenderId: "505702015926",
    appId: "1:505702015926:web:0525b2c9d02bc68c319717",
    measurementId: "G-KLFF2X1DM4",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);
export const auth = getAuth(app);

/**
 * 通信の調査用デバッグフラグ（ブラウザのコンソールで `localStorage.fsdebug = '1'` を設定して再読み込み）。
 * Mac Safari でのみTOPのマイリスト表示が遅れる事象の切り分け用で、ON の間は Firestore SDK の debug ログ
 * （通信方式・Watchストリームの接続状況）と、マイリスト・公開データ・認証確定の所要時間を毎回コンソールに出す。
 * 調査完了後は、このフラグと各所の `[fsdebug]` ログを削除し、useMylistEntries の SLOW_LOG_MS も見直すこと。
 */
export function isFsDebug(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('fsdebug') === '1';
  } catch {
    return false;
  }
}

if (isFsDebug()) setLogLevel('debug');