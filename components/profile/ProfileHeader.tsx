/**
 * プロフィールヘッダー（ページ 設定 プロフィール仕様書 §4・§9）。アイコン／表示名／自己紹介／登録日。
 * 本人のページでは「編集する」「公開設定」を出し、「編集する」でこのカードがインライン編集フォームに切り替わる（§9.3）。
 * 「公開設定」は設定ページへ移らず、その場でポップアップ（ProfileVisibilityModal）を開く（2026-10-12 ユーザー決定）。
 * 保存は PATCH /api/users/[userId]/profile 経由（表示名を変えると自分のレビュー・まとめの投稿者名・作成者名も揃う）。
 * アイコン（§9.2）は編集フォームで画像を選ぶとその場でプレビューし、「保存する」で PUT /api/users/[userId]/avatar に送る
 * （「画像を外す」は DELETE）。未設定はシルエット表示（UserAvatar）。
 */
'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { UserAvatar } from '@/components/layout/UserDropdown';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { LockIcon, PencilIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { ProfileVisibilityModal } from '@/components/profile/ProfileVisibilityModal';
import { COLLECTIONS_ENABLED } from '@/lib/feature-flags';
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  PROFILE_IMAGE_ERRORS,
  PROFILE_IMAGE_MIME_TYPES,
  ProfileImageUploadError,
  checkProfileImageFile,
  formatProfileDate,
  removeProfileImage,
  updateProfile,
  uploadProfileImage,
  validateProfileInput,
  type ProfileInputErrors,
  type ProfileJson,
} from '@/lib/profile';

type ProfileUser = ProfileJson['user'];

export function ProfileHeader({
  user: u,
  isSelf,
  onUserChange,
}: {
  user: ProfileUser;
  isSelf: boolean;
  /** 編集の保存・公開設定の切り替え後に、ページ側の表示を差し替える */
  onUserChange: (next: Partial<ProfileUser>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);

  if (editing) {
    return (
      <ProfileEditForm
        user={u}
        onCancel={() => setEditing(false)}
        onImageSaved={(profileImageUrl) => onUserChange({ profileImageUrl })}
        onSaved={(next) => {
          onUserChange(next);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <UserAvatar name={u.displayName} imageUrl={u.profileImageUrl} size={72} />
          <SectionHeading className="min-w-0 break-words">{u.displayName}</SectionHeading>
        </div>
        {isSelf && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <PencilIcon size={13} />
              編集する
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setVisibilityOpen(true)}>
              <LockIcon size={13} />
              公開設定
            </Button>
            <ProfileVisibilityModal
              open={visibilityOpen}
              onOpenChange={setVisibilityOpen}
              userId={u.userId}
              values={{ isMylistPublic: u.isMylistPublic, isReviewHistoryPublic: u.isReviewHistoryPublic }}
              onChange={(key, value) => onUserChange({ [key]: value })}
            />
          </div>
        )}
      </div>
      {u.bio && <p className="whitespace-pre-wrap break-words text-base text-text-secondary">{u.bio}</p>}
      {u.accountCreatedAt != null && <p className="text-md text-text-muted">登録日：{formatProfileDate(u.accountCreatedAt)}</p>}
    </Card>
  );
}

/** アイコンの変更内容。keep＝そのまま、file＝新しい画像に替える、remove＝外す */
/** 編集フォームのアイコンの大きさ（プレビューと UserAvatar で揃える） */
const EDIT_AVATAR_SIZE = 72;

type ImageChange = { kind: 'keep' } | { kind: 'file'; file: File; previewUrl: string } | { kind: 'remove' };

function ProfileEditForm({
  user: u,
  onCancel,
  onImageSaved,
  onSaved,
}: {
  user: ProfileUser;
  onCancel: () => void;
  /** アイコンだけ保存できて表示名・自己紹介の保存に失敗したとき（フォームは開いたまま） */
  onImageSaved: (profileImageUrl: string | null) => void;
  onSaved: (next: Pick<ProfileUser, 'displayName' | 'bio' | 'profileImageUrl'>) => void;
}) {
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(u.displayName);
  const [bio, setBio] = useState(u.bio ?? '');
  const [errors, setErrors] = useState<ProfileInputErrors>({});
  const [image, setImage] = useState<ImageChange>({ kind: 'keep' });
  const [imageError, setImageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageNoteId = useId();
  const bioOver = bio.trim().length > BIO_MAX;
  const hasImage = image.kind === 'file' || (image.kind === 'keep' && !!u.profileImageUrl);

  // プレビュー用の一時 URL は差し替え・画面を閉じたときに解放する
  const previewUrl = image.kind === 'file' ? image.previewUrl : null;
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // 同じファイルを選び直しても change が起きるように空にしておく
    e.target.value = '';
    if (!file) return;
    const code = checkProfileImageFile(file);
    if (code) {
      setImageError(PROFILE_IMAGE_ERRORS[code]);
      return;
    }
    setImageError(null);
    setImage({ kind: 'file', file, previewUrl: URL.createObjectURL(file) });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors = validateProfileInput({ displayName, bio });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    let profileImageUrl = u.profileImageUrl;
    try {
      // アイコンを先に保存する。画像で失敗したら表示名・自己紹介も保存せず、フォームに残して直してもらう
      if (image.kind === 'file') profileImageUrl = await uploadProfileImage(u.userId, image.file);
      else if (image.kind === 'remove' && u.profileImageUrl) {
        await removeProfileImage(u.userId);
        profileImageUrl = null;
      }
    } catch (err) {
      if (err instanceof ProfileImageUploadError && err.code) setImageError(PROFILE_IMAGE_ERRORS[err.code]);
      else toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
      setSaving(false);
      return;
    }
    try {
      onSaved({ ...(await updateProfile(u.userId, { displayName, bio })), profileImageUrl });
      toast({ type: 'success', message: 'プロフィールを保存しました' });
    } catch {
      // アイコンは保存済み。表示を合わせ、もう一度「保存する」で送り直すときに画像を二重に送らないようにする
      if (profileImageUrl !== u.profileImageUrl) {
        setImage({ kind: 'keep' });
        onImageSaved(profileImageUrl);
      }
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* エラー・ヒントの出し入れでアバターが上下しないよう上端で揃える */}
        <div className="flex items-start gap-4">
          {image.kind === 'file' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.previewUrl}
              alt=""
              className="inline-block shrink-0 rounded-full bg-bg-selected object-cover"
              style={{ width: EDIT_AVATAR_SIZE, height: EDIT_AVATAR_SIZE }}
              data-testid="profile-image-preview"
            />
          ) : (
            <UserAvatar imageUrl={image.kind === 'remove' ? null : u.profileImageUrl} size={EDIT_AVATAR_SIZE} />
          )}
          <Field label="表示名" error={errors.displayName} hint={COLLECTIONS_ENABLED ? 'レビューやまとめに表示される名前です' : 'レビューに表示される名前です'} className="min-w-0 flex-1 md:max-w-sm">
            {(props) => (
              <Input
                {...props}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, DISPLAY_NAME_MAX))}
                disabled={saving}
                autoFocus
              />
            )}
          </Field>
        </div>

        <div className="flex flex-col gap-[6px]" role="group" aria-labelledby="profile-image-label">
          <p id="profile-image-label" className="text-md text-text-tertiary">
            アイコン
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={saving} aria-describedby={imageNoteId}>
              {hasImage ? '画像を変更' : '画像を選ぶ'}
            </Button>
            {hasImage && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setImage({ kind: 'remove' });
                  setImageError(null);
                }}
                disabled={saving}
              >
                画像を外す
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={PROFILE_IMAGE_MIME_TYPES.join(',')}
            onChange={handleFileChange}
            className="hidden"
            data-testid="profile-image-input"
            aria-label="アイコンの画像"
          />
          {imageError ? (
            <p id={imageNoteId} role="alert" className="text-md text-input-error">
              {imageError}
            </p>
          ) : (
            <p id={imageNoteId} className="text-md text-text-muted">PNG・JPEG・WebP、5MBまで。中央を正方形に切り抜いて表示します</p>
          )}
        </div>

        <div className="flex flex-col gap-[6px]">
          <Field label="自己紹介" error={errors.bio}>
            {(props) => (
              <Textarea
                {...props}
                aria-invalid={bioOver || undefined}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="好きなジャンルやよく見る配信者など（任意）"
                rows={4}
                disabled={saving}
              />
            )}
          </Field>
          {/* 超過時はカウンターを赤色表示し保存不可（§9.4） */}
          <p className={cn('text-right text-md', bioOver ? 'text-input-error' : 'text-text-muted')}>
            {bio.trim().length} / {BIO_MAX}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" size="sm" loading={saving} disabled={bioOver}>
            保存する
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            キャンセル
          </Button>
        </div>
      </form>
    </Card>
  );
}
