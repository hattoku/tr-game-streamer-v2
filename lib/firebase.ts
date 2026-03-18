import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const isStg = process.env.NEXT_PUBLIC_APP_ENV === 'stg';

const firebaseConfig = isStg ? {
    apiKey: process.env.NEXT_PUBLIC_STG_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_STG_FIREBASE_AUTH_DOMAIN || "tr-game-streamer-stg.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_STG_FIREBASE_PROJECT_ID || "tr-game-streamer-stg",
    storageBucket: process.env.NEXT_PUBLIC_STG_FIREBASE_STORAGE_BUCKET || "tr-game-streamer-stg.firebasestorage.app",
    messagingSenderId: process.env.NEXT_PUBLIC_STG_FIREBASE_MESSAGING_SENDER_ID || "562598531589",
    appId: process.env.NEXT_PUBLIC_STG_FIREBASE_APP_ID || "1:562598531589:web:533c79bc648ed9d10d426c",
} : {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);