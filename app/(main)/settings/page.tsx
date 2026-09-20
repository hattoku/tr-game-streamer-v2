/**
 * 設定（/settings）。document/specification/page/ページ 設定 仕様書.md 準拠だが、
 * フェーズ4.5ステップ6では「ドッグフーディングに本当に必要な項目」のみの最小版として実装する
 * （HANDOFF.mdフェーズ4.5ステップ6参照。仕様書側にも2026-09-20実装の注記を追加済み）。
 *
 * 入れたもの: 表示名変更（プロフィール仕様書§9.2・§9.4の前倒し）／連続再生
 * （isContinuousPlayEnabled、動画プレーヤーの同項目と同じフィールドを共有）／ネタバレレビュー非表示
 * （hideSpoilerReviews、レビュー一覧の同項目と同じフィールドを共有）／マイリスト新着通知
 * （showNewArrivalNotification）／ログアウト。
 *
 * 入れなかったもの（未解決事項・後続フェーズへ）: メールアドレス・パスワード・パスキー変更（§4）、
 * マイリスト・レビュー履歴の公開設定（§5、プロフィールページが無く効果が見えないため）、
 * プッシュ通知の許可状態・種別トグル（§6、FCM基盤が未実装）、退会（§8、削除ポリシー未設計）、
 * お問い合わせ導線（§9、/contact未実装）。
 */
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Card, CardTitle, Checkbox, Field, Input, SectionHeading, Skeleton, SkeletonText, useToast } from '@/components/ui';

interface SettingsFields {
  displayName: string;
  isContinuousPlayEnabled: boolean;
  hideSpoilerReviews: boolean;
  showNewArrivalNotification: boolean;
}

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [fields, setFields] = useState<SettingsFields | null>(null);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // 未ログインはログインページへ（§2.1）
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const data = snap.data();
      setFields({
        displayName: (data?.displayName as string | undefined) ?? '',
        isContinuousPlayEnabled: typeof data?.isContinuousPlayEnabled === 'boolean' ? data.isContinuousPlayEnabled : true,
        hideSpoilerReviews: typeof data?.hideSpoilerReviews === 'boolean' ? data.hideSpoilerReviews : true,
        showNewArrivalNotification: typeof data?.showNewArrivalNotification === 'boolean' ? data.showNewArrivalNotification : true,
      });
      setDisplayNameInput((data?.displayName as string | undefined) ?? '');
    });
  }, [user]);

  async function handleSaveDisplayName(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const trimmed = displayNameInput.trim();
    if (!trimmed) {
      setDisplayNameError('入力してください');
      return;
    }
    if (trimmed.length > 30) {
      setDisplayNameError('30文字以内で入力してください');
      return;
    }
    setDisplayNameError(null);
    setSavingName(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { displayName: trimmed });
      toast({ type: 'success', message: '表示名を保存しました' });
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setSavingName(false);
    }
  }

  async function toggleField(key: Exclude<keyof SettingsFields, 'displayName'>, value: boolean) {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev));
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { [key]: value });
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    }
  }

  // 確認ダイアログなし、クリック即時実行（§7.2）
  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut(auth);
      router.push('/');
    } catch {
      toast({ type: 'error', message: 'ログアウトに失敗しました' });
      setSigningOut(false);
    }
  }

  if (loading || !user || fields === null) {
    return <SettingsSkeleton />;
  }

  return (
    <div>
      <SectionHeading className="mb-5">設定</SectionHeading>

      <div className="flex flex-col gap-6">
        <Card>
          <CardTitle className="mb-4">アカウント</CardTitle>
          <form onSubmit={handleSaveDisplayName} className="flex flex-col gap-3">
            <Field label="表示名" error={displayNameError} hint="レビューやコメントに表示される名前です" className="max-w-sm">
              {(props) => (
                <Input
                  {...props}
                  value={displayNameInput}
                  maxLength={30}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  disabled={savingName}
                />
              )}
            </Field>
            <div>
              <Button type="submit" variant="primary" size="sm" loading={savingName}>
                保存する
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardTitle className="mb-4">動画再生</CardTitle>
          <Checkbox
            label="連続再生"
            checked={fields.isContinuousPlayEnabled}
            onChange={(e) => toggleField('isContinuousPlayEnabled', e.target.checked)}
          />
          <p className="mt-1 text-md text-text-muted">再生リストの動画を最後まで見ると、自動で次の動画を再生します</p>
        </Card>

        <Card>
          <CardTitle className="mb-4">レビュー</CardTitle>
          <Checkbox
            label="ネタバレを含むコメントを隠す"
            checked={fields.hideSpoilerReviews}
            onChange={(e) => toggleField('hideSpoilerReviews', e.target.checked)}
          />
        </Card>

        <Card>
          <CardTitle className="mb-4">通知</CardTitle>
          <Checkbox
            label="マイリスト登録中のシリーズの新着通知を受け取る"
            checked={fields.showNewArrivalNotification}
            onChange={(e) => toggleField('showNewArrivalNotification', e.target.checked)}
          />
        </Card>

        <Card>
          <Button variant="secondary" onClick={handleSignOut} loading={signingOut}>
            ログアウト
          </Button>
        </Card>
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="読み込み中">
      <Skeleton className="h-6 w-[80px]" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <SkeletonText lines={2} />
        </Card>
      ))}
    </div>
  );
}
