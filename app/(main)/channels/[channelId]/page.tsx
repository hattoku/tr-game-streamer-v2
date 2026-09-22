/**
 * チャンネル詳細ページ（ページ チャンネル 詳細 仕様書）。
 * 1カラム構成。チャンネル情報セクション（アイコン／チャンネル名／再生リスト数・総動画数／
 * 「再生リストを追加する」／説明文＋AI生成バッジ）＋ 再生リスト一覧セクション
 * （ゲームタイトル詳細と共用の components/playlists/PlaylistListSection.tsx）。
 *
 * - 「再生リストを追加する」ボタンは GamePlaylistSection と同じく全ユーザー共通で
 *   `/playlists/new?channelId=` へ遷移させる（未ログインは登録ページ側で /login へ、一般ユーザーは
 *   同ページの「管理者のみ」空状態）。仕様 §3.3 の一般ユーザー向け「再生リストの登録を提案する」は
 *   提案フロー自体が未実装（フェーズ7）のため置かない。
 * - 説明文の編集（§3.3、管理者のみ）はインライン編集。仕様は「説明文がある場合のみ編集ボタン」だが、
 *   説明文なしで登録済みのチャンネルに後から付ける手段が無くなるため、未設定時も「説明文を追加する」を出す。
 * - channels ドキュメントは onSnapshot で購読し、編集保存後に即座に反映する（ゲームタイトル詳細と同じ方針）。
 */
'use client';

import { useEffect, useState } from 'react';
import { notFound, useParams } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchPlaylistsByChannel, type PlaylistSummary } from '@/components/playlists/PlaylistGrid';
import { PlaylistListSection } from '@/components/playlists/PlaylistListSection';
import { Card } from '@/components/ui/Card';
import { Button, LinkButton } from '@/components/ui/Button';
import { Checkbox, Field, Textarea } from '@/components/ui/Input';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { InventoryIcon, PencilIcon, PlayIcon, UserIcon } from '@/components/ui/icons';

interface ChannelDetail {
  name: string;
  iconUrl: string;
  description: string | null;
  isAiGeneratedDescription: boolean;
  playlistCount: number;
}

export default function ChannelDetailPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const { role } = useAuth();
  const isAdmin = role === 'owner' || role === 'operator';

  const [channel, setChannel] = useState<ChannelDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);

  useEffect(() => {
    if (!channelId) return;
    return onSnapshot(doc(db, 'channels', channelId), (snap) => {
      if (!snap.exists()) {
        setMissing(true);
        return;
      }
      const data = snap.data();
      setChannel({
        name: data.name ?? '',
        iconUrl: data.iconUrl ?? '',
        description: data.description ?? null,
        isAiGeneratedDescription: data.isAiGeneratedDescription ?? false,
        playlistCount: data.playlistCount ?? 0,
      });
    });
  }, [channelId]);

  useEffect(() => {
    if (!channelId) return;
    fetchPlaylistsByChannel(channelId).then(setPlaylists);
  }, [channelId]);

  if (missing) notFound();

  if (!channel) {
    return (
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          <Skeleton className="size-[120px] shrink-0 rounded-[12px]" />
          <SkeletonText lines={3} className="flex-1" />
        </Card>
      </div>
    );
  }

  const videoCount = playlists?.reduce((sum, p) => sum + p.videoCount, 0) ?? 0;
  const addHref = `/playlists/new?channelId=${encodeURIComponent(channelId)}`;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        {/* PC: アイコン左＋情報右の横並び、SP: 縦積み（§3.1） */}
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          <div className="size-[120px] shrink-0 overflow-hidden rounded-[12px] bg-bg-btn">
            {channel.iconUrl ? (
              // referrerPolicy: yt3.ggpht.com の Referer 制限対策
              // eslint-disable-next-line @next/next/no-img-element
              <img src={channel.iconUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-text-muted">
                <UserIcon size={48} />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <h1 className="text-2xl font-medium text-text-primary">{channel.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-md text-text-tertiary">
              <span className="inline-flex items-center gap-1">
                <InventoryIcon size={14} />
                {channel.playlistCount.toLocaleString()} 再生リスト
              </span>
              <span className="inline-flex items-center gap-1">
                <PlayIcon size={12} />
                {videoCount.toLocaleString()} 動画
              </span>
            </div>
            <LinkButton href={addHref} variant="secondary" size="sm" className="self-start">
              再生リストを追加する
            </LinkButton>
          </div>
        </div>

        <ChannelDescription
          channelId={channelId}
          description={channel.description}
          isAiGenerated={channel.isAiGeneratedDescription}
          editable={isAdmin}
        />
      </Card>

      <PlaylistListSection title="このチャンネルの再生リスト" playlists={playlists} addHref={addHref} />
    </div>
  );
}

/**
 * チャンネルの説明文（§3.3）。設定済みなら全幅で表示し、AI生成フラグONなら「AIによる生成」バッジを添える。
 * 管理者にはインライン編集（テキストエリア＋保存／キャンセル＋AI生成バッジトグル）を提供する。
 */
function ChannelDescription({
  channelId,
  description,
  isAiGenerated,
  editable,
}: {
  channelId: string;
  description: string | null;
  isAiGenerated: boolean;
  editable: boolean;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftAi, setDraftAi] = useState(false);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft(description ?? '');
    setDraftAi(isAiGenerated);
    setEditing(true);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      if (!auth.currentUser) throw new Error('not signed in');
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/admin/channels/${encodeURIComponent(channelId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ description: draft, isAiGeneratedDescription: draftAi }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      toast({ type: 'success', message: '説明文を保存しました' });
      setEditing(false);
    } catch {
      toast({ type: 'error', message: '保存に失敗しました。時間をおいて再試行してください' });
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3 border-t border-border-divider pt-4">
        <Field label="チャンネルの説明文">
          {(props) => <Textarea {...props} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={saving} rows={4} />}
        </Field>
        <Checkbox label="「AIによる生成」バッジを表示する" checked={draftAi} onChange={(e) => setDraftAi(e.target.checked)} disabled={saving} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
            キャンセル
          </Button>
          <Button variant="primary" size="sm" onClick={save} loading={saving}>
            保存する
          </Button>
        </div>
      </div>
    );
  }

  if (!description) {
    if (!editable) return null;
    return (
      <div className="border-t border-border-divider pt-4">
        <Button variant="secondary" size="sm" onClick={startEdit}>
          <PencilIcon size={13} />
          説明文を追加する
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border-divider pt-4">
      <p className="whitespace-pre-wrap text-base text-text-secondary">{description}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isAiGenerated ? (
          <span
            title="AIによる生成のため、誤りを含む可能性があります"
            className="inline-flex w-fit items-center rounded-[4px] bg-bg-hover px-2 py-[2px] text-sm text-text-muted"
          >
            AIによる生成
          </span>
        ) : (
          <span />
        )}
        {editable && (
          <Button variant="ghost" size="sm" onClick={startEdit}>
            <PencilIcon size={13} />
            編集する
          </Button>
        )}
      </div>
    </div>
  );
}
