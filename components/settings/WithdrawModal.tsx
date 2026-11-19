/**
 * 退会の確認モーダル（ページ 設定 仕様書 §8.2・§8.3）。
 * 本人の退会は、本人の作成データとアカウントを消去する（2026-11-19 ユーザー決定。戻せない）。
 * 取り返しがつかないので2段階にする: ①消えるものの案内と理由（任意）→ ②消去を理解した確認（チェック＋「退会」の入力）。
 * 退会したらログアウトして TOP へ戻る（§8.4）。
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button, Checkbox, Field, Input, Modal, Textarea, useToast } from '@/components/ui';
import { SELF_WITHDRAW_REASONS, WITHDRAW_REASON_MAX } from '@/lib/account-status-shared';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  /** ログアウトする直前に呼ぶ（設定ページが「未ログインはログインページへ」の転送をしないようにするため） */
  onLeaving?: () => void;
}

export function WithdrawModal({ open, onOpenChange, user, onLeaving }: Props) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="退会しますか？">
      {open && <WithdrawForm user={user} onClose={() => onOpenChange(false)} onLeaving={onLeaving} />}
    </Modal>
  );
}

const CONFIRM_WORD = '退会';

function WithdrawForm({ user, onClose, onLeaving }: { user: User; onClose: () => void; onLeaving?: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [choice, setChoice] = useState<string>('');
  const [detail, setDetail] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [understood, setUnderstood] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = [choice, detail.trim()].filter(Boolean).join('：');
  const tooLong = reason.length > WITHDRAW_REASON_MAX;

  async function handleWithdraw() {
    if (tooLong || !understood || typed.trim() !== CONFIRM_WORD) return;
    setBusy(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/account/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ reason, confirm: true }),
      });
      if (res.status === 403) {
        setError('このアカウントは退会できません');
        setBusy(false);
        return;
      }
      if (!res.ok) throw new Error(`withdraw ${res.status}`);
      onLeaving?.();
      await signOut(auth);
      toast({ type: 'success', message: '退会しました。データを消去しました' });
      router.push('/');
    } catch {
      setError('退会できませんでした。途中まで消えている場合があります。時間をおいて、もう一度「退会する」を押してください');
      setBusy(false);
    }
  }

  const canSubmit = understood && typed.trim() === CONFIRM_WORD && !tooLong;

  if (step === 1) {
    return (
      <div className="flex flex-col gap-4">
        <div role="alert" className="rounded-md border border-input-error p-3 text-base text-text-primary">
          <p className="font-bold">退会すると、あなたのデータはすべて消去され、元に戻せません。</p>
          <p className="mt-1 text-text-secondary">同じメールアドレスでログインしても、以前のデータは戻りません。</p>
        </div>
        <div className="text-base text-text-secondary">
          <p className="mb-1 text-text-primary">消えるもの</p>
          <ul className="list-disc pl-5">
            <li>投稿したレビュー（星評価・コメント）と、そのレビューへの「参考になった」</li>
            <li>マイリスト・視聴履歴・続きから再生の位置</li>
            <li>プロフィール（ユーザー名・自己紹介・アイコン）と、通知</li>
            <li>作成したまとめ・保存したまとめ</li>
            <li>お問い合わせの履歴（添付画像を含む）</li>
            <li>ログインできるアカウント（メールアドレス・パスワード）</li>
          </ul>
          <p className="mt-2">
            レビューの消去に合わせて、再生リストの評価（スコア）と件数は計算し直されます。審査済みの提案の記録は、あなたの名前を外して残ります。
          </p>
        </div>

        <fieldset>
          <legend className="mb-2 text-md text-text-tertiary">退会の理由（任意。あなたとは結びつけずに保存します）</legend>
          <div className="flex flex-col gap-2">
            {SELF_WITHDRAW_REASONS.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2 text-base text-text-primary">
                <input
                  type="radio"
                  name="withdraw-reason"
                  value={r}
                  checked={choice === r}
                  onChange={() => setChoice(r)}
                  className="size-4"
                />
                {r}
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="ご意見があればお聞かせください（任意）" error={tooLong ? `${WITHDRAW_REASON_MAX}文字以内で入力してください` : undefined}>
          {(props) => <Textarea {...props} rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} />}
        </Field>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button variant="secondary" onClick={() => setStep(2)} disabled={tooLong} data-testid="withdraw-next">
            退会の手続きに進む
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="alert" className="rounded-md border border-input-error p-3 text-base text-text-primary">
        <p className="font-bold">最後の確認です。「退会する」を押すと、すぐにデータを消去します。</p>
        <p className="mt-1 text-text-secondary">消去したデータは、運営でも戻せません。</p>
      </div>
      <Checkbox
        label="レビュー・マイリスト・視聴履歴・アカウントがすべて消去され、元に戻せないことを理解しました"
        checked={understood}
        onChange={(e) => setUnderstood(e.target.checked)}
        disabled={busy}
        data-testid="withdraw-understood"
      />
      <Field label={`確認のため、「${CONFIRM_WORD}」と入力してください`}>
        {(props) => (
          <Input {...props} value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy} autoComplete="off" />
        )}
      </Field>

      {error && (
        <p role="alert" className="text-md text-input-error">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setStep(1)} disabled={busy}>
          戻る
        </Button>
        <Button variant="primary" onClick={handleWithdraw} loading={busy} disabled={!canSubmit} data-testid="withdraw-confirm">
          退会する
        </Button>
      </div>
    </div>
  );
}
