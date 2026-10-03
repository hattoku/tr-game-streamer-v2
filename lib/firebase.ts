import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
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

function readLocalStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Safari（WebKit。iOS は全ブラウザが該当）では Firestore を常にロングポーリングで通信させる。
 * 既定の WebChannel ストリーミングだと、サーバーが即座に返した応答が Safari 側の受信バッファに溜まり、
 * 次にクライアントから何か送るまで JS に届かないことがあった（stg の Mac Safari で再現。TOPマイリストの
 * 取得が途中で十数秒止まり、タイムアウト後の再送信で押し出される形で届いていた）。
 * Chromium 系は問題がないため従来どおり（技術スタック仕様書 §2.2）。比較検証用に `localStorage.fsTransport` に
 * 'stream' / 'longpoll' を設定すると強制できる。
 */
function shouldForceLongPolling(): boolean {
  const override = readLocalStorage('fsTransport');
  if (override === 'stream') return false;
  if (override === 'longpoll') return true;
  if (typeof navigator === 'undefined') return false;
  // iPadOS はデスクトップ表示時に Mac の UA を名乗るため、タッチ対応の MacIntel も WebKit として扱う
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  const ua = navigator.userAgent;
  return /AppleWebKit/.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua);
}

function createFirestore(): Firestore {
  try {
    return initializeFirestore(app, { experimentalForceLongPolling: shouldForceLongPolling() });
  } catch {
    // HMR 等で既に初期化済みの場合
    return getFirestore(app);
  }
}

export const db = createFirestore();
export const auth = getAuth(app);