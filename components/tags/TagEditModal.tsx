/**
 * タグ編集モーダル（ページ ゲームタイトル 詳細仕様書 第8章「一般ユーザーによるタグ編集」）。
 * 再生リスト詳細（PlaylistInfoCard）とゲームタイトル詳細の両方から呼び出す共通部品。
 * §8.2どおり、モーダル内はローカルな下書き編集とし、「保存する」で確定するまで
 * サーバーへは反映しない（キャンセルで破棄）。
 * サジェスト（§8.4）: 1文字以上でタグマスタの前方一致候補を最大5件、五十音順で表示。
 * 既に付与済み・追加予定のタグは候補から除外する。マスタに無い語句もそのまま追加できる。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { auth } from '@/lib/firebase';
import { fetchTagsMap, type ResolvedTag, type TagInfo } from '@/lib/tags';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { LockIcon, XIcon } from '@/components/ui/icons';

const MAX_SUGGESTIONS = 5;

interface TagEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: 'playlist' | 'game';
  targetId: string;
  /** 現在このターゲットに付与されているタグ（固定→登録日順。lib/tags.ts の resolveTags 参照） */
  tags: ResolvedTag[];
}

async function getIdToken(): Promise<string> {
  if (!auth.currentUser) throw new Error('not signed in');
  return auth.currentUser.getIdToken();
}

export function TagEditModal({ open, onOpenChange, targetType, targetId, tags }: TagEditModalProps) {
  const { toast } = useToast();
  const [keptIds, setKeptIds] = useState<Set<string>>(new Set());
  const [pendingAdds, setPendingAdds] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<TagInfo[]>([]);
  const [saving, setSaving] = useState(false);

  // モーダルを開くたびに下書きを現在の状態にリセットする。「propが変わったらstateを調整する」
  // パターンは描画中に直接setStateする（effect内でのsetStateは1テンポ余分な再描画を招く。
  // ReviewForm・GamePlaylistSection等と同じ対応）
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setKeptIds(new Set(tags.map((t) => t.id)));
      setPendingAdds([]);
      setInput('');
      setInputError(null);
    }
  }

  useEffect(() => {
    if (!open || allTags.length > 0) return;
    fetchTagsMap().then((map) => setAllTags([...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'))));
  }, [open, allTags.length]);

  const fixedTags = tags.filter((t) => t.fixed);
  const editableTags = tags.filter((t) => !t.fixed && keptIds.has(t.id));

  const existingNames = useMemo(
    () => new Set([...editableTags.map((t) => t.name.toLowerCase()), ...pendingAdds.map((n) => n.toLowerCase())]),
    [editableTags, pendingAdds],
  );

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    return allTags
      .filter((t) => t.name.toLowerCase().startsWith(q) && !existingNames.has(t.name.toLowerCase()))
      .slice(0, MAX_SUGGESTIONS);
  }, [allTags, input, existingNames]);

  function addTagName(rawName: string) {
    const name = rawName.trim();
    if (!name) {
      setInputError('タグを入力してください');
      return;
    }
    if (existingNames.has(name.toLowerCase())) {
      setInputError('既に登録されているタグです');
      return;
    }
    setPendingAdds((prev) => [...prev, name]);
    setInput('');
    setInputError(null);
  }

  function removeEditableTag(id: string) {
    setKeptIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function removePendingAdd(name: string) {
    setPendingAdds((prev) => prev.filter((n) => n !== name));
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTagName(input);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const idToken = await getIdToken();
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` };

      const removedTagIds = tags.filter((t) => !t.fixed && !keptIds.has(t.id)).map((t) => t.id);
      let hadError = false;

      for (const tagId of removedTagIds) {
        const res = await fetch('/api/tags/detach', {
          method: 'POST',
          headers,
          body: JSON.stringify({ targetType, targetId, tagId }),
        });
        if (!res.ok) hadError = true;
      }
      for (const tagName of pendingAdds) {
        const res = await fetch('/api/tags/attach', {
          method: 'POST',
          headers,
          body: JSON.stringify({ targetType, targetId, tagName }),
        });
        if (!res.ok) hadError = true;
      }

      if (hadError) {
        toast({ type: 'error', message: '一部のタグの更新に失敗しました。時間をおいて再試行してください' });
      } else {
        toast({ type: 'success', message: 'タグを更新しました' });
      }
      onOpenChange(false);
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="タグを編集する">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {fixedTags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-[4px] bg-bg-hover px-2 py-[3px] text-sm text-text-secondary"
            >
              <LockIcon size={11} />
              {t.name}
            </span>
          ))}
          {editableTags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-[4px] bg-bg-hover px-2 py-[3px] text-sm text-text-secondary"
            >
              {t.name}
              <button type="button" aria-label={`${t.name}を削除`} onClick={() => removeEditableTag(t.id)} className="text-text-muted hover:text-text-primary">
                <XIcon size={11} />
              </button>
            </span>
          ))}
          {pendingAdds.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-[4px] bg-bg-selected px-2 py-[3px] text-sm text-text-primary"
            >
              {name}
              <button type="button" aria-label={`${name}を削除`} onClick={() => removePendingAdd(name)} className="text-text-muted hover:text-text-primary">
                <XIcon size={11} />
              </button>
            </span>
          ))}
          {fixedTags.length === 0 && editableTags.length === 0 && pendingAdds.length === 0 && (
            <p className="text-base text-text-muted">タグはまだありません</p>
          )}
        </div>

        <div className="relative flex flex-col gap-1">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setInputError(null);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="タグを追加"
              aria-label="タグを追加"
              aria-invalid={!!inputError}
            />
            <Button variant="secondary" onClick={() => addTagName(input)} disabled={!input.trim()}>
              追加
            </Button>
          </div>
          {inputError && (
            <p role="alert" className="text-md text-input-error">
              {inputError}
            </p>
          )}
          {suggestions.length > 0 && (
            <ul className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-[8px] border border-surface-border bg-gradient-elevated shadow-elevated">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => addTagName(s.name)}
                    className="block w-full px-3 py-2 text-left text-base text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            保存する
          </Button>
        </div>
      </div>
    </Modal>
  );
}
