/**
 * 設定（/settings）。document/specification/page/ページ 設定 仕様書.md 準拠だが、
 * フェーズ4.5ステップ6では「ドッグフーディングに本当に必要な項目」のみの最小版として実装する
 * （HANDOFF.mdフェーズ4.5ステップ6参照。仕様書側にも2026-09-20実装の注記を追加済み）。
 *
 * 入れたもの: 連続再生
 * （isContinuousPlayEnabled、動画プレーヤーの同項目と同じフィールドを共有）／先の話のサムネイルを隠す
 * （hideUpcomingThumbnails、2026-09-26追加。再生リスト詳細の動画リストで使う）／ネタバレレビュー非表示
 * （hideSpoilerReviews、レビュー一覧の同項目と同じフィールドを共有）／マイリスト新着通知
 * （showNewArrivalNotification）／マイリスト・レビュー履歴の公開設定（§5、isMylistPublic・isReviewHistoryPublic、
 * フェーズ6ステップ5-2で追加）／ログアウト。表示名は以前ここで変更していたが、5-2でプロフィールページのインライン編集
 * （プロフィール仕様書§9）へ移し、ここには「プロフィールを編集」への導線だけを置く（§1.2 の非スコープどおり）。
 *
 * メールアドレス変更（§4.3）は 2026-11-17 に追加（「アカウント」カード内。モーダルは components/settings/EmailChangeModal.tsx）。
 *
 * 退会（§8）は 2026-11-17 に追加。アカウントを残してログインできなくする方式（物理削除はしない。モーダルは
 * components/settings/WithdrawModal.tsx）。管理者・テスト用会員は退会できない。
 *
 * 入れなかったもの（未解決事項・後続フェーズへ）: パスワード・パスキー変更（§4.4・§4.5）、
 * プッシュ通知の許可状態・種別トグル（§6、FCM基盤が未実装）。
 * お問い合わせ導線（§9）はフェーズ7ステップ7-3-1で /contact と同時に追加した。
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Card, CardDivider, CardTitle, Checkbox, LinkButton, SectionHeading, Skeleton, SkeletonText, useToast } from '@/components/ui';
import { EmailChangeModal } from '@/components/settings/EmailChangeModal';
import { WithdrawModal } from '@/components/settings/WithdrawModal';

interface SettingsFields {
  isContinuousPlayEnabled: boolean;
  hideUpcomingThumbnails: boolean;
  hideSpoilerReviews: boolean;
  showNewArrivalNotification: boolean;
  isMylistPublic: boolean;
  isReviewHistoryPublic: boolean;
}

/** トグルと同時に保存完了トーストを出す項目（§5.4。他の項目は従来どおり失敗時のみ通知） */
const PRIVACY_KEYS: ReadonlySet<keyof SettingsFields> = new Set(['isMylistPublic', 'isReviewHistoryPublic']);

export default function SettingsPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [fields, setFields] = useState<SettingsFields | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  /** ログアウト・退会で自分から TOP へ移るところ。未ログインの転送（/login）をしない */
  const leavingRef = useRef(false);
  /** テスト用会員は退会できない（管理 ユーザー管理仕様書 §5.3） */
  const [isTestUser, setIsTestUser] = useState(false);
  /** users/{uid}.email（ミラー）。Auth のアドレスとずれていれば合わせる（§4.3。変更は確認メールのリンクで完了するため） */
  const [mirroredEmail, setMirroredEmail] = useState<string | null | undefined>(undefined);

  // 未ログインはログインページへ（§2.1）
  useEffect(() => {
    if (!loading && !user && !leavingRef.current) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const data = snap.data();
      setMirroredEmail(typeof data?.email === 'string' ? data.email : null);
      setIsTestUser(data?.isTestUser === true);
      setFields({
        isContinuousPlayEnabled: typeof data?.isContinuousPlayEnabled === 'boolean' ? data.isContinuousPlayEnabled : true,
        hideUpcomingThumbnails: data?.hideUpcomingThumbnails === true,
        hideSpoilerReviews: typeof data?.hideSpoilerReviews === 'boolean' ? data.hideSpoilerReviews : true,
        showNewArrivalNotification: typeof data?.showNewArrivalNotification === 'boolean' ? data.showNewArrivalNotification : true,
        // 未設定は公開（init-user で true を書くが、それ以前のアカウントにはフィールドが無い。プロフィール API と同じ扱い）
        isMylistPublic: data?.isMylistPublic !== false,
        isReviewHistoryPublic: data?.isReviewHistoryPublic !== false,
      });
    });
  }, [user]);

  useEffect(() => {
    if (!user || mirroredEmail === undefined || !user.email || mirroredEmail === user.email) return;
    let cancelled = false;
    (async () => {
      try {
        const idToken = await user.getIdToken();
        if (cancelled) return;
        await fetch('/api/account/email/sync', { method: 'POST', headers: { Authorization: `Bearer ${idToken}` } });
      } catch {
        // 次に開いたときにまた合わせる
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, mirroredEmail]);

  async function toggleField(key: keyof SettingsFields, value: boolean) {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev));
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { [key]: value });
      if (PRIVACY_KEYS.has(key)) toast({ type: 'success', message: '設定を保存しました' });
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    }
  }

  // 確認ダイアログなし、クリック即時実行（§7.2）
  async function handleSignOut() {
    setSigningOut(true);
    leavingRef.current = true;
    try {
      await signOut(auth);
      router.push('/');
    } catch {
      leavingRef.current = false;
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
          <p className="mb-3 text-md text-text-muted">表示名・自己紹介はプロフィールページで編集できます</p>
          <div>
            <LinkButton href={`/profile/${user.uid}`} variant="secondary" size="sm">
              プロフィールを編集
            </LinkButton>
          </div>
          {/* メールアドレス（§4.3）。マスクせず全文を表示する */}
          {user.email && (
            <>
              <CardDivider className="my-4" />
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-md text-text-tertiary">メールアドレス</p>
                  <p className="mt-1 break-all text-base text-text-primary" data-testid="settings-email">
                    {user.email}
                  </p>
                </div>
                <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setEmailModalOpen(true)}>
                  変更する
                </Button>
              </div>
              <EmailChangeModal open={emailModalOpen} onOpenChange={setEmailModalOpen} user={user} />
            </>
          )}
        </Card>

        <Card>
          <CardTitle className="mb-4">動画再生</CardTitle>
          <Checkbox
            label="連続再生"
            checked={fields.isContinuousPlayEnabled}
            onChange={(e) => toggleField('isContinuousPlayEnabled', e.target.checked)}
          />
          <p className="mt-1 text-md text-text-muted">再生リストの動画を最後まで見ると、自動で次の動画を再生します</p>
          <Checkbox
            label="まだ見ていない先の話のサムネイルを隠す"
            checked={fields.hideUpcomingThumbnails}
            onChange={(e) => toggleField('hideUpcomingThumbnails', e.target.checked)}
            className="mt-4"
          />
          <p className="mt-1 text-md text-text-muted">再生リストの登録動画で、視聴済みより先の話のサムネイルを表示しません（ネタバレ防止）</p>
        </Card>

        <Card>
          <CardTitle className="mb-4">レビュー</CardTitle>
          <Checkbox
            label="ネタバレを含むコメントを隠す"
            checked={fields.hideSpoilerReviews}
            onChange={(e) => toggleField('hideSpoilerReviews', e.target.checked)}
          />
        </Card>

        {/* 公開設定（§5 プライバシー設定）。見出しはプロフィールの「公開設定」ボタン・ポップアップと名前を揃える。
            仕様のトグルスイッチ部品は無いため、他の設定項目と同じチェックボックスで揃える */}
        <Card>
          <CardTitle className="mb-4">公開設定</CardTitle>
          <Checkbox
            label="マイリストを公開する"
            checked={fields.isMylistPublic}
            onChange={(e) => toggleField('isMylistPublic', e.target.checked)}
          />
          <p className="mt-1 text-md text-text-muted">他のユーザーにマイリストを公開します</p>
          <Checkbox
            label="レビュー履歴を公開する"
            checked={fields.isReviewHistoryPublic}
            onChange={(e) => toggleField('isReviewHistoryPublic', e.target.checked)}
            className="mt-4"
          />
          <p className="mt-1 text-md text-text-muted">他のユーザーにレビュー履歴を公開します</p>
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

        {/* 退会（§8）。一般ユーザーだけ。テスト用会員は押せない */}
        {role === 'user' && (
          <Card>
            <CardTitle className="mb-4">退会</CardTitle>
            <p className="mb-3 text-md text-text-muted">
              退会すると、レビュー・マイリスト・視聴履歴・アカウントなどのデータがすべて消去され、元に戻せません
            </p>
            <div>
              <Button variant="secondary" size="sm" onClick={() => setWithdrawOpen(true)} disabled={isTestUser}>
                退会する
              </Button>
            </div>
            {isTestUser && <p className="mt-2 text-md text-text-muted">テスト用会員は退会できません</p>}
            <WithdrawModal
              open={withdrawOpen}
              onOpenChange={setWithdrawOpen}
              user={user}
              onLeaving={() => {
                leavingRef.current = true;
              }}
            />
          </Card>
        )}

        {/* お問い合わせ導線（§9） */}
        <Card>
          <CardTitle className="mb-4">お問い合わせ</CardTitle>
          <p className="mb-3 text-md text-text-muted">サービスに関するお問い合わせやご要望はこちらから</p>
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/contact" variant="secondary" size="sm">
              お問い合わせフォームへ
            </LinkButton>
            <LinkButton href="/contact/history" variant="secondary" size="sm">
              お問い合わせ履歴を確認する
            </LinkButton>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="読み込み中">
      <Skeleton className="h-6 w-[80px]" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <SkeletonText lines={2} />
        </Card>
      ))}
    </div>
  );
}
