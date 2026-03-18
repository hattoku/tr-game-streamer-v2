'use client';

import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export default function Home() {
    const [projectId, setProjectId] = useState('');
    const [status, setStatus] = useState('接続中...');

    useEffect(() => {
        setProjectId(process.env.NEXT_PUBLIC_APP_ENV === 'stg' ? 'tr-game-streamer-stg' : 'tr-game-streamer');

        getDocs(collection(db, 'test'))
            .then(() => setStatus('✅ Firestore接続成功'))
            .catch((e) => setStatus('❌ エラー: ' + e.message));
    }, []);

    return (
        <div>
            <p>環境: {process.env.NEXT_PUBLIC_APP_ENV ?? 'production'}</p>
            <p>ProjectID: {projectId}</p>
            <p>{status}</p>
        </div>
    );
}