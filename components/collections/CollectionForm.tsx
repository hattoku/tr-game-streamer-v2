/**
 * まとめの作成・編集フォーム（まとめ機能仕様書 §4.2〜§4.4）。
 * タイトル・説明文・公開設定・ネタバレコメントの表示・再生リスト（最大10件）。
 * 再生リストの並び替えは ↑↓ボタンのみ（§4.3 のドラッグ＆ドロップは 2026-10-08 ユーザー決定で見送り）。
 * 公開設定・ネタバレ設定の択一選択は Chip を択一トグルとして使う（視聴ステータス記録UIと同じ見た目。
 * ラジオボタンの共通部品は未整備のため。ReportModal の生の radio とあわせて整備する場合はここも置き換える）。
 * 保存は app/api/collections（作成）・app/api/collections/[collectionId]（編集）。
 */
'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { ChevronDownIcon, ChevronUpIcon, PlusIcon, TrashIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import {
  COLLECTION_DESCRIPTION_MAX,
  COLLECTION_PLAYLISTS_MAX,
  COLLECTION_TITLE_MAX,
  CollectionApiError,
  VISIBILITY_OPTIONS,
  callCollectionsApi,
  type CollectionPlaylist,
  type CollectionVisibility,
} from '@/lib/collections';
import { PlaylistPickerModal } from './PlaylistPickerModal';

export interface CollectionFormValues {
  title: string;
  description: string;
  visibility: CollectionVisibility;
  showSpoiler: boolean;
  playlists: CollectionPlaylist[];
}

export function CollectionForm({
  collectionId,
  initial,
  onSaved,
  onCancel,
}: {
  /** 編集時のみ。省略時は新規作成 */
  collectionId?: string;
  initial: CollectionFormValues;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [visibility, setVisibility] = useState(initial.visibility);
  const [showSpoiler, setShowSpoiler] = useState(initial.showSpoiler);
  const [playlists, setPlaylists] = useState(initial.playlists);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // バリデーション（§4.4）。タイトル・再生リストの未入力は保存を押すまでエラー表示しない
  const titleError = submitted && !title.trim() ? 'タイトルを入力してください' : null;
  const descriptionOver = description.length > COLLECTION_DESCRIPTION_MAX;
  const playlistsError = submitted && playlists.length === 0 ? '再生リストを1件以上追加してください' : null;
  const full = playlists.length >= COLLECTION_PLAYLISTS_MAX;

  function move(index: number, delta: -1 | 1) {
    setPlaylists((prev) => {
      const next = [...prev];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }

  async function handleSave() {
    setSubmitted(true);
    if (!title.trim() || descriptionOver || playlists.length === 0 || saving) return;
    setSaving(true);
    try {
      const body = { title, description, visibility, showSpoiler, playlistIds: playlists.map((p) => p.id) };
      if (collectionId) {
        await callCollectionsApi(`/api/collections/${encodeURIComponent(collectionId)}`, 'PATCH', body);
        toast({ type: 'success', message: 'まとめを保存しました' });
        onSaved(collectionId);
      } else {
        const { id } = await callCollectionsApi<{ id: string }>('/api/collections', 'POST', body);
        toast({ type: 'success', message: 'まとめを作成しました' });
        onSaved(id);
      }
    } catch (e) {
      toast({ type: 'error', message: e instanceof CollectionApiError ? e.message : '保存に失敗しました。時間をおいて再試行してください' });
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-6">
      <Field label="タイトル（必須）" error={titleError}>
        {(props) => (
          <Input
            {...props}
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, COLLECTION_TITLE_MAX))}
            placeholder="例: 初見でも楽しめるホラーゲーム実況"
            disabled={saving}
          />
        )}
      </Field>

      <div className="flex flex-col gap-[6px]">
        <Field label="説明文">
          {(props) => (
            <Textarea
              {...props}
              aria-invalid={descriptionOver || undefined}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="このまとめについて（任意）"
              rows={4}
              disabled={saving}
            />
          )}
        </Field>
        {/* 超過時はカウンターを赤色表示し保存不可（§4.4） */}
        <p className={cn('text-right text-md', descriptionOver ? 'text-input-error' : 'text-text-muted')}>
          {description.length} / {COLLECTION_DESCRIPTION_MAX}
        </p>
      </div>

      <ChoiceGroup label="公開設定">
        {VISIBILITY_OPTIONS.map((o) => (
          <Chip key={o.value} active={visibility === o.value} onClick={() => setVisibility(o.value)} disabled={saving}>
            {o.label}
          </Chip>
        ))}
        <p className="basis-full text-md text-text-muted">{VISIBILITY_OPTIONS.find((o) => o.value === visibility)?.description}</p>
      </ChoiceGroup>

      <ChoiceGroup label="ネタバレを含むレビューコメント">
        <Chip active={!showSpoiler} onClick={() => setShowSpoiler(false)} disabled={saving}>
          折りたたむ
        </Chip>
        <Chip active={showSpoiler} onClick={() => setShowSpoiler(true)} disabled={saving}>
          そのまま表示する
        </Chip>
      </ChoiceGroup>

      <div className="flex flex-col gap-3">
        <p className="text-md text-text-tertiary">
          再生リスト（必須・最大{COLLECTION_PLAYLISTS_MAX}件）
          <span className="ml-2 text-text-muted">
            {playlists.length} / {COLLECTION_PLAYLISTS_MAX}
          </span>
        </p>
        {playlists.length > 0 && (
          <ol className="flex flex-col gap-2">
            {playlists.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3 rounded-[8px] border border-border-divider p-2">
                <span className="w-5 shrink-0 text-center text-md text-text-muted">{i + 1}</span>
                <span className="relative block aspect-video w-[80px] shrink-0 overflow-hidden rounded-[6px] bg-bg-player md:w-[112px]">
                  {p.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                  )}
                </span>
                <p className="line-clamp-2 min-w-0 flex-1 text-base text-text-primary">{p.title}</p>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" aria-label={`${i + 1}番目を上へ移動`} disabled={saving || i === 0} onClick={() => move(i, -1)}>
                    <ChevronUpIcon size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${i + 1}番目を下へ移動`}
                    disabled={saving || i === playlists.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ChevronDownIcon size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${i + 1}番目をまとめから外す`}
                    disabled={saving}
                    onClick={() => setPlaylists((prev) => prev.filter((x) => x.id !== p.id))}
                  >
                    <TrashIcon size={13} />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <Button variant="secondary" size="sm" className="self-start" disabled={saving || full} onClick={() => setPickerOpen(true)}>
          <PlusIcon size={13} />
          再生リストを追加する
        </Button>
        {playlistsError && (
          <p role="alert" className="text-md text-input-error">
            {playlistsError}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-border-divider pt-4">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          キャンセル
        </Button>
        <Button variant="primary" onClick={handleSave} loading={saving} disabled={descriptionOver}>
          保存する
        </Button>
      </div>

      <PlaylistPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedIds={playlists.map((p) => p.id)}
        disabled={full}
        onPick={(p) => setPlaylists((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]))}
      />
    </Card>
  );
}

/** 択一選択のチップ群（ラベル付き） */
function ChoiceGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-[6px]">
      <p className="text-md text-text-tertiary">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
