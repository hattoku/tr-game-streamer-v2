/**
 * まとめの編集ページ（まとめ機能仕様書 §4.2）。作成者本人のみ。
 * 本人以外・存在しない場合は 404 とする（非公開まとめの存在を明かさない）。
 */
'use client';

import { useEffect, useState } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { SectionHeading } from '@/components/ui/Card';
import { CenteredSpinner } from '@/components/ui/Spinner';
import { CollectionForm, type CollectionFormValues } from '@/components/collections/CollectionForm';
import { fetchCollectionPlaylists, toCollectionData } from '@/lib/collections';

export default function EditCollectionPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [initial, setInitial] = useState<CollectionFormValues | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !collectionId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'collections', collectionId));
        const c = snap.exists() ? toCollectionData(snap) : null;
        if (!c || c.userId !== user.uid) {
          setMissing(true);
          return;
        }
        setInitial({
          title: c.title,
          description: c.description ?? '',
          visibility: c.visibility,
          showSpoiler: c.showSpoiler,
          playlists: await fetchCollectionPlaylists(c.playlistIds),
        });
      } catch {
        setMissing(true);
      }
    })();
  }, [user, collectionId]);

  if (missing) notFound();
  if (!initial) return <CenteredSpinner />;

  return (
    <div className="mx-auto flex w-full max-w-[800px] flex-col gap-6">
      <SectionHeading>まとめを編集する</SectionHeading>
      <CollectionForm
        collectionId={collectionId}
        initial={initial}
        onSaved={(id) => router.push(`/collections/${id}`)}
        onCancel={() => router.back()}
      />
    </div>
  );
}
