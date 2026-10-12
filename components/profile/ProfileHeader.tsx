/**
 * プロフィールヘッダー（ページ 設定 プロフィール仕様書 §4・§9）。アイコン／表示名／自己紹介／登録日。
 * 本人のページでは「編集する」「公開設定」を出し、「編集する」でこのカードがインライン編集フォームに切り替わる（§9.3）。
 * 「公開設定」は設定ページへ移らず、その場でポップアップ（ProfileVisibilityModal）を開く（2026-10-12 ユーザー決定）。
 * 保存は PATCH /api/users/[userId]/profile 経由（表示名を変えると自分のレビュー・まとめの投稿者名・作成者名も揃う）。
 * プロフィール画像の変更（§9.2）は Firebase Storage 未導入のため見送り（2026-10-12 ユーザー決定）。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { UserAvatar } from '@/components/layout/UserDropdown';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { LockIcon, PencilIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { ProfileVisibilityModal } from '@/components/profile/ProfileVisibilityModal';
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  formatProfileDate,
  updateProfile,
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

function ProfileEditForm({
  user: u,
  onCancel,
  onSaved,
}: {
  user: ProfileUser;
  onCancel: () => void;
  onSaved: (next: Pick<ProfileUser, 'displayName' | 'bio'>) => void;
}) {
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(u.displayName);
  const [bio, setBio] = useState(u.bio ?? '');
  const [errors, setErrors] = useState<ProfileInputErrors>({});
  const [saving, setSaving] = useState(false);
  const bioOver = bio.trim().length > BIO_MAX;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors = validateProfileInput({ displayName, bio });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    try {
      onSaved(await updateProfile(u.userId, { displayName, bio }));
      toast({ type: 'success', message: 'プロフィールを保存しました' });
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* エラー・ヒントの出し入れでアバターが上下しないよう上端で揃える */}
        <div className="flex items-start gap-4">
          <UserAvatar name={displayName.trim() || u.displayName} imageUrl={u.profileImageUrl} size={72} />
          <Field label="表示名" error={errors.displayName} hint="レビューやまとめに表示される名前です" className="min-w-0 flex-1 md:max-w-sm">
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
