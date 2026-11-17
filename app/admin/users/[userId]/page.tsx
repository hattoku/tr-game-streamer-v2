/**
 * ユーザー詳細（/admin/users/[userId]）。管理 ユーザー管理仕様書 §3.2〜§3.6。オーナー・運営者。
 * - 登録情報の編集: ユーザー名・自己紹介・アイコンの削除だけ（2026-11-17 ユーザー決定）。メールアドレスは変えられない
 * - 運営用の備考: 管理者だけが読み書きする（本人には見えない）
 * - 退会させる／退会を解除する: 管理者が退会させたら本人では再開できない。管理者・テスト用会員は退会させられない
 * 操作はすべて管理 API（lib/admin-users.ts）。操作のたびに詳細を読み直す。
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  deleteAdminUserAvatar,
  fetchAdminUser,
  restoreAdminUser,
  saveAdminUserNote,
  updateAdminUserProfile,
  withdrawAdminUser,
} from '@/lib/admin-users';
import { AdminApiError } from '@/lib/admin-api';
import { ADMIN_NOTE_MAX, WITHDRAW_REASON_MAX, type AdminUserDetailJson } from '@/lib/account-status-shared';
import { BIO_MAX, DISPLAY_NAME_MAX, validateProfileInput, type ProfileInputErrors } from '@/lib/profile-shared';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card, CardDivider, CardTitle, SectionHeading } from '@/components/ui/Card';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { RoleBadge, StatusTag, formatDateTime } from '@/components/admin/users/labels';

const GENERIC_ERROR = '通信エラーが発生しました。時間をおいて再試行してください';

export default function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<AdminUserDetailJson | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');

  const apply = useCallback((result: AdminUserDetailJson | unknown) => {
    if (result instanceof Error) {
      setState(result instanceof AdminApiError && result.status === 404 ? 'not_found' : 'error');
    } else {
      setUser(result as AdminUserDetailJson);
      setState('ready');
    }
  }, []);

  const reload = useCallback(async () => {
    apply(await fetchAdminUser(userId).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e)))));
  }, [userId, apply]);

  useEffect(() => {
    let cancelled = false;
    fetchAdminUser(userId)
      .catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))))
      .then((result) => {
        if (!cancelled) apply(result);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, apply]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/admin/users" className="inline-flex items-center gap-1 text-md text-text-muted hover:text-text-primary">
          <ChevronLeftIcon size={14} />
          ユーザー一覧へ
        </Link>
      </div>

      {state === 'loading' ? (
        <Card aria-busy="true">
          <SkeletonText lines={4} />
        </Card>
      ) : state === 'not_found' ? (
        <p className="py-10 text-center text-base text-text-muted">このユーザーは見つかりません</p>
      ) : state === 'error' || !user ? (
        <p className="py-10 text-center text-base text-text-muted">読み込みに失敗しました。ページを再読み込みしてください</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SectionHeading>{user.displayName}</SectionHeading>
            <StatusTag status={user.accountStatus} withdrawnBy={user.withdrawnBy} />
            <RoleBadge role={user.role} isTestUser={user.isTestUser} />
          </div>
          <BasicInfo user={user} />
          <ProfileEditor key={`${user.displayName}\n${user.bio ?? ''}`} user={user} onSaved={reload} />
          <NoteEditor key={user.noteUpdatedAt ?? 'none'} user={user} onSaved={reload} />
          <WithdrawSection user={user} onChanged={reload} />
        </>
      )}
    </div>
  );
}

function InfoRow({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col gap-[2px] sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-md text-text-tertiary sm:w-[120px]">{label}</dt>
      <dd className="min-w-0 break-all text-base text-text-primary" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

function BasicInfo({ user }: { user: AdminUserDetailJson }) {
  return (
    <Card>
      <CardTitle className="mb-4">基本情報</CardTitle>
      <dl className="flex flex-col gap-3">
        <InfoRow label="メールアドレス" testId="admin-user-email">
          {user.email ?? '—'}
          <span className="mt-1 block text-md text-text-muted">メールアドレスは管理画面からは変更できません</span>
        </InfoRow>
        <InfoRow label="登録日時">{formatDateTime(user.createdAt)}</InfoRow>
        <InfoRow label="最終ログイン">{formatDateTime(user.lastLoginAt)}</InfoRow>
        <InfoRow label="レビュー">{user.reviewCount.toLocaleString()}件</InfoRow>
        <InfoRow label="マイリスト">{user.mylistCount.toLocaleString()}件</InfoRow>
        <InfoRow label="ユーザーID">{user.uid}</InfoRow>
      </dl>
      {user.accountStatus === 'active' && (
        <div className="mt-4">
          <LinkButton href={`/profile/${encodeURIComponent(user.uid)}`} variant="secondary" size="sm" target="_blank" rel="noopener noreferrer">
            公開プロフィールを開く
          </LinkButton>
        </div>
      )}
    </Card>
  );
}

function ProfileEditor({ user, onSaved }: { user: AdminUserDetailJson; onSaved: () => Promise<void> }) {
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio ?? '');
  const [errors, setErrors] = useState<ProfileInputErrors>({});
  const [busy, setBusy] = useState<'save' | 'avatar' | null>(null);
  const [avatarConfirm, setAvatarConfirm] = useState(false);
  const changed = displayName.trim() !== user.displayName || bio.trim() !== (user.bio ?? '');

  async function save() {
    const found = validateProfileInput({ displayName, bio });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy('save');
    try {
      await updateAdminUserProfile(user.uid, { displayName, bio });
      toast({ type: 'success', message: '登録情報を保存しました' });
      await onSaved();
    } catch {
      toast({ type: 'error', message: GENERIC_ERROR });
    } finally {
      setBusy(null);
    }
  }

  async function removeAvatar() {
    setBusy('avatar');
    try {
      await deleteAdminUserAvatar(user.uid);
      setAvatarConfirm(false);
      toast({ type: 'success', message: 'アイコンを削除しました' });
      await onSaved();
    } catch {
      toast({ type: 'error', message: GENERIC_ERROR });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardTitle className="mb-1">登録情報の編集</CardTitle>
      <p className="mb-4 text-md text-text-muted">不適切な名前・自己紹介・アイコンを直すときに使います。公開設定などの本人の設定は変えられません</p>
      <div className="flex flex-col gap-4">
        <Field label="ユーザー名" error={errors.displayName} hint={`${DISPLAY_NAME_MAX}文字以内`}>
          {(props) => (
            <Input {...props} value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={busy !== null} data-testid="admin-user-name" />
          )}
        </Field>
        <Field label="自己紹介" error={errors.bio} hint={`${BIO_MAX}文字以内`}>
          {(props) => <Textarea {...props} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} disabled={busy !== null} />}
        </Field>
        <div>
          <Button variant="secondary" onClick={save} loading={busy === 'save'} disabled={!changed || busy !== null}>
            保存する
          </Button>
        </div>
      </div>

      <CardDivider className="my-4" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* 退会中のアイコンは配信 API が返さないため、枠だけになることがある */}
          {user.profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- 配信 API の相対 URL をそのまま出す（プロフィールと同じ）
            <img src={user.profileImageUrl} alt="" className="size-10 shrink-0 rounded-full bg-bg-hover object-cover" />
          ) : (
            <span className="size-10 shrink-0 rounded-full bg-bg-hover" />
          )}
          <p className="text-md text-text-secondary">{user.profileImageUrl ? 'アイコンが設定されています' : 'アイコンは未設定です'}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setAvatarConfirm(true)} disabled={!user.profileImageUrl || busy !== null}>
          アイコンを削除
        </Button>
      </div>
      <Modal open={avatarConfirm} onOpenChange={setAvatarConfirm} title="アイコンを削除しますか？" description="本人のアイコンが未設定の表示に戻ります。この操作は取り消せません。">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAvatarConfirm(false)} disabled={busy !== null}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={removeAvatar} loading={busy === 'avatar'}>
            削除する
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

function NoteEditor({ user, onSaved }: { user: AdminUserDetailJson; onSaved: () => Promise<void> }) {
  const { toast } = useToast();
  const [note, setNote] = useState(user.note);
  const [busy, setBusy] = useState(false);
  const tooLong = note.trim().length > ADMIN_NOTE_MAX;

  async function save() {
    if (tooLong) return;
    setBusy(true);
    try {
      await saveAdminUserNote(user.uid, note);
      toast({ type: 'success', message: '備考を保存しました' });
      await onSaved();
    } catch {
      toast({ type: 'error', message: GENERIC_ERROR });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle className="mb-1">備考（運営用メモ）</CardTitle>
      <p className="mb-4 text-md text-text-muted">管理者だけが見られます。本人には表示されません</p>
      <Field label="備考" error={tooLong ? `${ADMIN_NOTE_MAX}文字以内で入力してください` : undefined}>
        {(props) => <Textarea {...props} rows={4} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} data-testid="admin-user-note" />}
      </Field>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={save} loading={busy} disabled={tooLong || note.trim() === user.note}>
          保存する
        </Button>
        {user.noteUpdatedAt && (
          <span className="text-sm text-text-muted">
            最終更新 {formatDateTime(user.noteUpdatedAt)}
            {user.noteUpdatedByName && `（${user.noteUpdatedByName}）`}
          </span>
        )}
      </div>
    </Card>
  );
}

function WithdrawSection({ user, onChanged }: { user: AdminUserDetailJson; onChanged: () => Promise<void> }) {
  const { toast } = useToast();
  const [open, setOpen] = useState<'withdraw' | 'restore' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const withdrawn = user.accountStatus === 'withdrawn';
  const tooLong = reason.trim().length > WITHDRAW_REASON_MAX;

  async function run() {
    setBusy(true);
    try {
      if (open === 'withdraw') {
        await withdrawAdminUser(user.uid, reason.trim());
        toast({ type: 'success', message: '退会させました' });
      } else {
        await restoreAdminUser(user.uid);
        toast({ type: 'success', message: '退会を解除しました' });
      }
      setOpen(null);
      setReason('');
      await onChanged();
    } catch {
      toast({ type: 'error', message: GENERIC_ERROR });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle className="mb-4">退会</CardTitle>
      {withdrawn ? (
        <dl className="mb-4 flex flex-col gap-3">
          <InfoRow label="退会日時">{formatDateTime(user.withdrawnAt)}</InfoRow>
          <InfoRow label="退会させた人">{user.withdrawnBy === 'admin' ? '運営（本人では再開できません）' : '本人（同じメールアドレス・パスワードでログインすれば再開できます）'}</InfoRow>
          {user.withdrawnBy === 'self' && <InfoRow label="本人の理由">{user.withdrawReason ?? '（未記入）'}</InfoRow>}
          {user.withdrawnBy === 'admin' && <InfoRow label="運営の理由">{user.adminWithdrawReason ?? '（未記入）'}</InfoRow>}
        </dl>
      ) : (
        <p className="mb-4 text-md text-text-muted">
          退会させると、このユーザーはログインできなくなります。レビュー・プロフィール・マイリストは他の人から見えなくなります（データは残り、解除すると元に戻ります）。運営が退会させた場合、本人では再開できません
        </p>
      )}
      {user.canWithdraw ? (
        <Button variant="secondary" onClick={() => setOpen(withdrawn ? 'restore' : 'withdraw')} data-testid="admin-user-withdraw-toggle">
          {withdrawn ? '退会を解除する' : '退会させる'}
        </Button>
      ) : (
        <p className="text-md text-text-muted">管理者・テスト用会員は退会させられません</p>
      )}

      <Modal
        open={open !== null}
        onOpenChange={(o) => !o && !busy && setOpen(null)}
        title={open === 'restore' ? '退会を解除しますか？' : 'このユーザーを退会させますか？'}
        description={
          open === 'restore'
            ? 'ログインできるようになり、レビュー・プロフィール・マイリストも元どおり見えるようになります。'
            : 'ログインできなくなり、本人では再開できません。あとから「退会を解除する」で戻せます。'
        }
      >
        {open === 'withdraw' && (
          <Field label="退会の理由（任意。管理者だけが見られます）" error={tooLong ? `${WITHDRAW_REASON_MAX}文字以内で入力してください` : undefined} className="mb-4">
            {(props) => <Textarea {...props} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />}
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(null)} disabled={busy}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={run} loading={busy} disabled={tooLong} data-testid="admin-user-withdraw-confirm">
            {open === 'restore' ? '解除する' : '退会させる'}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
