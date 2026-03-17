import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyBzyJD3jV7naEB7WSdwgEru-53gyooRz68",
    authDomain: "tr-game-streamer.firebaseapp.com",
    projectId: "tr-game-streamer",
    storageBucket: "tr-game-streamer.firebasestorage.app",
    messagingSenderId: "505702015926",
    appId: "1:505702015926:web:8ede2c227551b596319717",
    measurementId: "G-5PP8C7G7Z1"
};

// Firebase の初期化（既に初期化されている場合はスキップ）
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Firestore インスタンスのエクスポート
export const db = getFirestore(app);