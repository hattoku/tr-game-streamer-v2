import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
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