/**
 * まとめの新規作成ページ（まとめ機能仕様書 §4.1・§4.2）。
 * 「まとめに追加する」ダイアログの「新しいまとめを作る」から `?playlistId=` 付きで来た場合は、
 * その再生リストを入れた状態で始める。未ログインはログインページへ。
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { SectionHeading } from '@/components/ui/Card';
import { CenteredSpinner } from '@/components/ui/Spinner';
import { CollectionForm } from '@/components/collections/CollectionForm';
import { fetchCollectionPlaylists, type CollectionPlaylist } from '@/lib/collections';

export default function NewCollectionPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const playlistId = useSearchParams().get('playlistId');
  const [initialPlaylists, setInitialPlaylists] = useState<CollectionPlaylist[] | null>(playlistId ? null : []);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!playlistId) return;
    fetchCollectionPlaylists([playlistId]).then(setInitialPlaylists);
  }, [playlistId]);

  if (!user || !initialPlaylists) return <CenteredSpinner />;

  return (
    <div className="mx-auto flex w-full max-w-[800px] flex-col gap-6">
      <SectionHeading>まとめを作成する</SectionHeading>
      <CollectionForm
        initial={{ title: '', description: '', visibility: 'private', showSpoiler: false, playlists: initialPlaylists }}
        onSaved={(id) => router.push(`/collections/${id}`)}
        onCancel={() => router.back()}
      />
    </div>
  );
}
