/**
 * プロフィールページ（ページ 設定 プロフィール仕様書、まとめ機能仕様書 §9）。ログイン不要で閲覧できる。
 * 1カラムで ①ヘッダー ②統計 ③ジャンル分布 ④マイリスト ⑤レビュー履歴 ⑥まとめ ⑦保存したまとめ（本人のみ）を縦に積む。
 *
 * - データは GET /api/users/[userId]/profile（Admin SDK）からまとめて取る（他人の users・mylist はクライアントから読めないため）。
 *   ログイン状態の確定を待ってから IDトークン付きで取り、本人なら公開設定にかかわらず全セクションが返る（§2.1）。
 * - マイリスト・レビュー履歴は、他人のページでは公開設定OFFならセクションごと出さない（API が null を返す。§2.3）。
 * - プロフィール画像のアップロードは見送り（Firebase Storage 未導入、2026-10-12 ユーザー決定）。アバターは UserAvatar の頭文字表示。
 * - 保存したまとめは既存の API（/api/collections/saved）から取る。閲覧できなくなったまとめは /collections/saved 側で管理する。
 * - 「編集する」（§9 インライン編集）はフェーズ6ステップ5-2で追加する。
 */
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { UserAvatar } from '@/components/layout/UserDropdown';
import { CollectionCard } from '@/components/collections/CollectionCard';
import { ProfileAccordion } from '@/components/profile/ProfileAccordion';
import { ProfilePlaylistCard } from '@/components/profile/ProfilePlaylistCard';
import { SpoilerRevealButton, useHideSpoilers } from '@/components/reviews/spoiler';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card, CardTitle, SectionHeading } from '@/components/ui/Card';
import { StatusChip, WATCH_STATUS_LABEL } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Checkbox } from '@/components/ui/Input';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StarRating } from '@/components/ui/StarRating';
import { Tag } from '@/components/ui/Tag';
import { AlertIcon, InventoryIcon, LockIcon, PlusIcon, StarIcon } from '@/components/ui/icons';
import {
  collectionThumbnails,
  fetchCollectionPlaylists,
  fetchSavedCollections,
  fromCollectionJson,
  type CollectionData,
} from '@/lib/collections';
import { fetchProfile, formatProfileDate, ProfileNotFoundError, type ProfileJson, type ProfileReviewJson } from '@/lib/profile';

const COMMENT_EXCERPT_LENGTH = 100;

export default function ProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  // 別ユーザーのプロフィールへ遷移したとき（同じルートでコンポーネントが再利用される）に前のユーザーの state を持ち越さないよう、userId で作り直す
  return <ProfileView key={userId} userId={userId} />;
}

function ProfileView({ userId }: { userId: string }) {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<ProfileJson | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saved, setSaved] = useState<CollectionData[] | null>(null);
  const [savedThumbnailById, setSavedThumbnailById] = useState<Map<string, string>>(new Map());
  const [hideSpoilers, toggleHideSpoilers] = useHideSpoilers(user);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set());

  // ログイン状態が確定してから取る（本人判定に IDトークンを使うため）
  useEffect(() => {
    if (!userId || loading) return;
    let cancelled = false;
    fetchProfile(userId).then(
      (p) => {
        if (cancelled) return;
        setProfile(p);
        setLoadError(false);
      },
      (e) => {
        if (cancelled) return;
        if (e instanceof ProfileNotFoundError) setMissing(true);
        else setLoadError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId, user, loading]);

  const isSelf = profile?.isSelf === true;
  useEffect(() => {
    if (!isSelf) return;
    let cancelled = false;
    (async () => {
      try {
        const viewable = (await fetchSavedCollections()).flatMap((i) => (i.collection ? [i.collection] : []));
        const playlists = await fetchCollectionPlaylists([...new Set(viewable.flatMap((c) => c.playlistIds.slice(0, 3)))]);
        if (cancelled) return;
        setSaved(viewable);
        setSavedThumbnailById(new Map(playlists.map((p) => [p.id, p.thumbnailUrl])));
      } catch {
        if (!cancelled) setSaved([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSelf]);

  if (missing) notFound();

  if (loadError) {
    return (
      <EmptyState
        icon={<AlertIcon />}
        title="プロフィールを読み込めませんでした"
        description="通信状況を確認して、ページを再読み込みしてください"
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            再読み込み
          </Button>
        }
      />
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <SkeletonText lines={3} />
          </Card>
        ))}
      </div>
    );
  }

  const { user: u, stats, genres, mylist, reviews } = profile;
  const collections = profile.collections.map(fromCollectionJson);
  const collectionThumbnailById = new Map(Object.entries(profile.collectionThumbnailById));

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8">
      {/* ① プロフィールヘッダー（§4） */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <UserAvatar name={u.displayName} imageUrl={u.profileImageUrl} size={72} />
            <SectionHeading className="min-w-0 break-words">{u.displayName}</SectionHeading>
          </div>
          {isSelf && (
            <LinkButton href="/settings" variant="secondary" size="sm">
              <LockIcon size={13} />
              公開設定
            </LinkButton>
          )}
        </div>
        {u.bio && <p className="whitespace-pre-wrap break-words text-base text-text-secondary">{u.bio}</p>}
        {u.accountCreatedAt != null && <p className="text-md text-text-muted">登録日：{formatProfileDate(u.accountCreatedAt)}</p>}
      </Card>

      {/* ② 統計情報（§5） */}
      <section aria-label="統計情報">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard label="レビュー投稿数" value={stats.reviewCount} unit="件" />
          <StatCard label="「参考になった」獲得数" value={stats.helpfulCount} unit="回" />
          <Card className="col-span-2 flex min-w-0 flex-col gap-2 md:col-span-1">
            <p className="text-md text-text-muted">視聴ステータス内訳</p>
            {stats.watchStatusCounts.length === 0 ? (
              <p className="text-base text-text-faint">まだありません</p>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
                {stats.watchStatusCounts.map((c) => (
                  <div key={c.status} className="contents">
                    <dt className="text-text-secondary">{WATCH_STATUS_LABEL[c.status]}</dt>
                    <dd className="text-right font-medium text-text-primary">{c.count}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
        </div>
      </section>

      {/* ③ ジャンル分布（§6。0件ならセクションごと出さない） */}
      {genres.length > 0 && (
        <Card className="flex flex-col gap-3">
          <CardTitle>よくレビューするジャンル</CardTitle>
          <ul className="flex flex-wrap gap-2">
            {genres.map((g) => (
              <li key={g.name}>
                <Tag emphasis>
                  {g.name} {g.count}件
                </Tag>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ④ マイリスト（§7） */}
      {mylist && (
        <ProfileSection title="マイリスト" count={mylist.length}>
          {mylist.length === 0 ? (
            <EmptyState icon={<InventoryIcon />} title="まだマイリストに登録している再生リストはありません" className="py-10" />
          ) : (
            <ProfileAccordion
              label="マイリスト"
              items={mylist}
              getKey={(m) => m.playlist.id}
              renderItem={(m) => (
                <ProfilePlaylistCard
                  playlist={m.playlist}
                  showVideoCount
                  meta={
                    <>
                      {m.watchStatus && <StatusChip status={m.watchStatus} active readOnly />}
                      <ScoreLabel score={m.playlist.score} />
                    </>
                  }
                />
              )}
            />
          )}
        </ProfileSection>
      )}

      {/* ⑤ レビュー履歴（§8） */}
      {reviews && (
        <ProfileSection
          title="レビュー履歴"
          count={reviews.length}
          trailing={
            reviews.length > 0 && (
              <Checkbox label="ネタバレを隠す" checked={hideSpoilers} onChange={(e) => toggleHideSpoilers(e.target.checked)} />
            )
          }
        >
          {reviews.length === 0 ? (
            <EmptyState icon={<StarIcon />} title="まだレビューの投稿はありません" className="py-10" />
          ) : (
            <ProfileAccordion
              label="レビュー履歴"
              items={reviews}
              getKey={(r) => r.id}
              renderItem={(r) => (
                <ReviewHistoryCard
                  review={r}
                  spoilerHidden={r.hasSpoiler && hideSpoilers && !revealedSpoilers.has(r.id)}
                  onReveal={() => setRevealedSpoilers((prev) => new Set(prev).add(r.id))}
                />
              )}
            />
          )}
        </ProfileSection>
      )}

      {/* ⑥ まとめ（まとめ機能仕様書 §9.1。公開まとめのみ。他人のページで0件ならセクションごと出さない） */}
      {(isSelf || collections.length > 0) && (
        <ProfileSection
          title="まとめ"
          count={collections.length}
          trailing={
            isSelf && (
              <LinkButton href="/collections/new" variant="secondary" size="sm">
                <PlusIcon size={13} />
                作る
              </LinkButton>
            )
          }
        >
          {collections.length === 0 ? (
            <EmptyState
              icon={<InventoryIcon />}
              title="公開中のまとめはありません"
              description={
                <>
                  非公開・限定公開のまとめは<Link href="/collections/mine" className="underline hover:text-text-primary">自分のまとめ</Link>で確認できます
                </>
              }
              className="py-10"
            />
          ) : (
            <ProfileAccordion
              label="まとめ"
              items={collections}
              getKey={(c) => c.id}
              renderItem={(c) => <CollectionCard collection={c} thumbnails={collectionThumbnails(c, collectionThumbnailById)} />}
            />
          )}
        </ProfileSection>
      )}

      {/* ⑦ 保存したまとめ（まとめ機能仕様書 §9.2。本人のページのみ） */}
      {isSelf && (
        <ProfileSection
          title="保存したまとめ"
          count={saved?.length}
          trailing={
            <LinkButton href="/collections/saved" variant="ghost" size="sm">
              保存したまとめ一覧へ
            </LinkButton>
          }
        >
          {!saved ? (
            <Card>
              <SkeletonText lines={2} />
            </Card>
          ) : saved.length === 0 ? (
            <EmptyState
              icon={<InventoryIcon />}
              title="保存したまとめはまだありません"
              description="気になるまとめを開いて「まとめを保存する」を押すと、ここにまとまります"
              className="py-10"
            />
          ) : (
            <ProfileAccordion
              label="保存したまとめ"
              items={saved}
              getKey={(c) => c.id}
              renderItem={(c) => <CollectionCard collection={c} thumbnails={collectionThumbnails(c, savedThumbnailById)} />}
            />
          )}
        </ProfileSection>
      )}
    </div>
  );
}

function StatCard({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <Card className="flex min-w-0 flex-col gap-2">
      <p className="text-md text-text-muted">{label}</p>
      <p className="text-text-primary">
        <span className="text-score font-bold">{value.toLocaleString()}</span>
        <span className="ml-1 text-base text-text-secondary">{unit}</span>
      </p>
    </Card>
  );
}

function ProfileSection({
  title,
  count,
  trailing,
  children,
}: {
  title: string;
  count: number | undefined;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>
          {title}
          {count != null && <span className="ml-1 text-base font-normal text-text-muted">（{count}件）</span>}
        </CardTitle>
        {trailing}
      </div>
      {children}
    </section>
  );
}

function ScoreLabel({ score }: { score: number | null }) {
  return (
    <span className="inline-flex items-center gap-1 text-md">
      <StarIcon size={13} className="text-brand-score" />
      {score == null ? <span className="text-text-muted">評価なし</span> : <span className="font-semibold text-text-primary">{score.toFixed(1)}</span>}
    </span>
  );
}

function ReviewHistoryCard({ review: r, spoilerHidden, onReveal }: { review: ProfileReviewJson; spoilerHidden: boolean; onReveal: () => void }) {
  const excerpt = r.comment && r.comment.length > COMMENT_EXCERPT_LENGTH ? `${r.comment.slice(0, COMMENT_EXCERPT_LENGTH)}…` : r.comment;
  const edited = r.updatedAt != null && r.postedAt != null && r.updatedAt !== r.postedAt;
  return (
    <ProfilePlaylistCard
      playlist={r.playlist}
      meta={
        <>
          {r.starRating != null && (
            <span className="inline-flex items-center gap-2">
              <StarRating value={r.starRating} readOnly size={15} />
              <span className="text-md text-brand-score">{r.starRating.toFixed(1)}</span>
            </span>
          )}
          {r.watchStatus && <StatusChip status={r.watchStatus} readOnly />}
        </>
      }
    >
      {excerpt &&
        (spoilerHidden ? (
          <SpoilerRevealButton onReveal={onReveal} />
        ) : (
          <p className="whitespace-pre-wrap break-words text-base text-text-secondary">{excerpt}</p>
        ))}
      <p className="self-end text-sm text-text-muted">
        投稿日：{formatProfileDate(r.postedAt)}
        {edited ? `（${formatProfileDate(r.updatedAt)} 更新）` : ''}
      </p>
    </ProfilePlaylistCard>
  );
}
