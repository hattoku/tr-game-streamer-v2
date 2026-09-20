/**
 * ゲームタイトル新規登録モーダル（管理者専用、フェーズ4.5ステップ2）。
 * GameSelectModalのフッター「見つからない場合」導線から開く。一般ユーザー向けの
 * 「登録を提案する」モーダル（ページ 再生リストを追加する 仕様書 §4.2.2）とは別物で、
 * 審査を経ずその場で`games`に直接書き込む（同仕様書 §4.2.2 末尾の対象ユーザー注記のとおり、
 * 管理者はマスタ管理相当の直接登録ができるため提案フローの対象外）。
 * 楽天ブックスAPI連携は未実装のため、パッケージ画像・商品ページURLはいずれも手入力（任意）。
 */
'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SelectMenu } from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/Toast';
import { CheckIcon } from '@/components/ui/icons';
import type { GameOption } from '@/components/playlists/GameSelectModal';

// プレミテの対象機種（管理_AI運営者 コンテンツ収集機能仕様書 §3参照）＋テストデータで
// 実績のあるSteamを加えた固定候補。自由入力ではなく手入力表記のブレを防ぐ
const PLATFORM_OPTIONS = ['Nintendo Switch', 'Nintendo Switch 2', 'PS5', 'PS4', 'Steam'];

interface MasterOption {
  id: string;
  name: string;
}

interface GameCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (game: GameOption) => void;
}

async function getIdToken(): Promise<string> {
  if (!auth.currentUser) throw new Error('not signed in');
  return auth.currentUser.getIdToken();
}

export function GameCreateModal({ open, onOpenChange, onCreated }: GameCreateModalProps) {
  const { toast } = useToast();

  const [genres, setGenres] = useState<MasterOption[]>([]);
  const [themes, setThemes] = useState<MasterOption[]>([]);

  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [genreId, setGenreId] = useState('');
  const [themeIds, setThemeIds] = useState<Set<string>>(new Set());
  const [platforms, setPlatforms] = useState<Set<string>>(new Set());
  const [packageImageUrl, setPackageImageUrl] = useState('');
  const [rakutenUrl, setRakutenUrl] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // モーダルを開くたびにフォームをリセットする（TagEditModalと同じ
  // 「propが変わったらstateを調整する」パターン。effect内のsetStateより1テンポ早い）
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle('');
      setTitleError(null);
      setGenreId('');
      setThemeIds(new Set());
      setPlatforms(new Set());
      setPackageImageUrl('');
      setRakutenUrl('');
      setDescription('');
    }
  }

  useEffect(() => {
    if (!open || genres.length > 0) return;
    Promise.all([getDocs(collection(db, 'genres')), getDocs(collection(db, 'themes'))])
      .then(([genresSnap, themesSnap]) => {
        setGenres(
          genresSnap.docs
            .map((d) => ({ id: d.id, name: (d.data().name as string) ?? '' }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
        );
        setThemes(
          themesSnap.docs
            .map((d) => ({ id: d.id, name: (d.data().name as string) ?? '' }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
        );
      })
      .catch((e) => console.error('genres/themes の読み込みに失敗', e));
  }, [open, genres.length]);

  function toggleTheme(id: string) {
    setThemeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePlatform(name: string) {
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleSubmit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError('ゲームタイトル名を入力してください');
      return;
    }
    if (trimmedTitle.length > 100) {
      setTitleError('100文字以内で入力してください');
      return;
    }
    setTitleError(null);
    setSubmitting(true);
    try {
      const idToken = await getIdToken();
      const res = await fetch('/api/admin/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          title: trimmedTitle,
          genreId: genreId || null,
          themeIds: [...themeIds],
          platforms: [...platforms],
          packageImageUrl: packageImageUrl.trim() || null,
          rakutenUrl: rakutenUrl.trim() || null,
          description: description.trim() || null,
        }),
      });
      const resBody = await res.json();
      if (!res.ok) {
        if (resBody.error === 'already_exists') {
          setTitleError('同名のゲームタイトルが既に登録されています');
        } else {
          toast({ type: 'error', message: '登録に失敗しました。時間をおいて再試行してください' });
        }
        return;
      }
      onCreated({ id: resBody.id, title: resBody.title, packageImageUrl: resBody.packageImageUrl });
      toast({ type: 'success', message: 'ゲームタイトルを登録しました' });
      onOpenChange(false);
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setSubmitting(false);
    }
  }

  const genreOptions = [{ value: '', label: '未設定' }, ...genres.map((g) => ({ value: g.id, label: g.name }))];

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="ゲームタイトルを登録する" maxWidthClassName="max-w-[560px]">
      <div className="flex flex-col gap-4">
        <Field label="ゲームタイトル名" error={titleError}>
          {(props) => (
            <Input
              {...props}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleError(null);
              }}
              maxLength={100}
              disabled={submitting}
              autoFocus
            />
          )}
        </Field>

        <Field label="ジャンル">
          <SelectMenu
            value={genreId}
            onValueChange={setGenreId}
            options={genreOptions}
            aria-label="ジャンル"
            disabled={submitting || genres.length === 0}
          />
        </Field>

        {themes.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-md text-text-tertiary">テーマ</p>
            <div className="flex flex-wrap gap-2">
              {themes.map((t) => (
                <ToggleChip key={t.id} label={t.name} selected={themeIds.has(t.id)} onClick={() => toggleTheme(t.id)} disabled={submitting} />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-md text-text-tertiary">プラットフォーム</p>
          <div className="flex flex-wrap gap-2">
            {PLATFORM_OPTIONS.map((p) => (
              <ToggleChip key={p} label={p} selected={platforms.has(p)} onClick={() => togglePlatform(p)} disabled={submitting} />
            ))}
          </div>
        </div>

        <Field label="パッケージ画像URL（任意）" hint="楽天ブックス連携は準備中のため、必要なら手入力してください">
          {(props) => (
            <Input {...props} type="url" value={packageImageUrl} onChange={(e) => setPackageImageUrl(e.target.value)} disabled={submitting} />
          )}
        </Field>

        <Field label="楽天ブックス商品ページURL（任意）">
          {(props) => (
            <Input {...props} type="url" value={rakutenUrl} onChange={(e) => setRakutenUrl(e.target.value)} disabled={submitting} />
          )}
        </Field>

        <Field label="説明文（任意）">
          {(props) => <Textarea {...props} value={description} onChange={(e) => setDescription(e.target.value)} disabled={submitting} />}
        </Field>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>
            登録する
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ToggleChip({ label, selected, onClick, disabled }: { label: string; selected: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="secondary" size="sm" active={selected} aria-pressed={selected} onClick={onClick} disabled={disabled}>
      {selected && <CheckIcon size={11} />}
      {label}
    </Button>
  );
}
