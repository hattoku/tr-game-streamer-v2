import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const isStg = process.env.NEXT_PUBLIC_APP_ENV === 'stg';

const firebaseConfig = isStg ? {
    apiKey: process.env.NEXT_PUBLIC_STG_FIREBASE_API_KEY || "AIzaSyB_HmS-y7rgzDYVQMAryn5Ugbmsxrjmb5Y",
    authDomain: process.env.NEXT_PUBLIC_STG_FIREBASE_AUTH_DOMAIN || "tr-game-streamer-stg.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_STG_FIREBASE_PROJECT_ID || "tr-game-streamer-stg",
    storageBucket: process.env.NEXT_PUBLIC_STG_FIREBASE_STORAGE_BUCKET || "tr-game-streamer-stg.firebasestorage.app",
    messagingSenderId: process.env.NEXT_PUBLIC_STG_FIREBASE_MESSAGING_SENDER_ID || "562598531589",
    appId: process.env.NEXT_PUBLIC_STG_FIREBASE_APP_ID || "1:562598531589:web:533c79bc648ed9d10d426c",
} : {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBzyJD3jV7naEB7WSdwgEru-53gyooRz68",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "tr-game-streamer.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "tr-game-streamer",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "tr-game-streamer.firebasestorage.app",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "505702015926",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:505702015926:web:8ede2c227551b596319717",
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-5PP8C7G7Z1",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);