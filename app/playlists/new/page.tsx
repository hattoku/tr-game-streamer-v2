'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db, auth } from '../../../lib/firebase';
import { useAuth } from '../../../contexts/AuthContext';

// 「再生リストを追加する」の管理者専用・最小版（動作確認用）。
// 一般ユーザーの提案フロー・AI説明文自動生成・ゲームタイトル追加提案モーダルは
// スコープ外（wiki/sources/2026-09-10-phase2-plan.md、
// document/specification/page/ページ 再生リストを追加する 仕様書.md 参照）。
// login/page.tsxと同様、スタイリングは行わず動作確認を優先する。

interface PreviewResult {
  playlist: {
    youtubePlaylistId: string;
    title: string;
    thumbnailUrl: string;
    itemCount: number;
    isPublic: boolean;
  };
  channel: { youtubeChannelId: string; name: string; iconUrl: string };
  channelMatches: boolean;
  channelAlreadyRegistered: boolean;
  playlistAlreadyRegistered: boolean;
}

interface GameOption {
  id: string;
  title: string;
}

interface CompletionResult {
  playlistId: string;
  title: string;
  thumbnailUrl: string;
  channelName: string;
  channelIconUrl: string;
  gameName: string;
  videoCount: number;
}

async function getIdToken(): Promise<string> {
  if (!auth.currentUser) throw new Error('not signed in');
  return auth.currentUser.getIdToken();
}

export default function NewPlaylistPage() {
  const { user, role, loading } = useAuth();

  const [playlistUrl, setPlaylistUrl] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [games, setGames] = useState<GameOption[]>([]);
  const [selectedGame, setSelectedGame] = useState<GameOption | null>(null);
  const [gameModalOpen, setGameModalOpen] = useState(false);
  const [gameSearch, setGameSearch] = useState('');

  const [channelDescription, setChannelDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<CompletionResult | null>(null);

  const isAdmin = role === 'owner' || role === 'operator';

  useEffect(() => {
    if (!isAdmin) return;
    getDocs(collection(db, 'games')).then((snapshot) => {
      setGames(snapshot.docs.map((d) => ({ id: d.id, title: (d.data().title as string) ?? '' })));
    });
  }, [isAdmin]);

  async function handleUrlBlur() {
    if (!playlistUrl) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    try {
      const idToken = await getIdToken();
      const res = await fetch('/api/playlists/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ playlistUrl }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPreviewError(previewErrorMessage(body.error));
        return;
      }
      setPreview(body as PreviewResult);
    } catch {
      setPreviewError('再生リストの取得に失敗しました');
    } finally {
      setPreviewLoading(false);
    }
  }

  function previewErrorMessage(code: string): string {
    switch (code) {
      case 'invalid_url':
        return 'YouTubeの再生リストURLを入力してください';
      case 'playlist_not_found':
        return '再生リストが見つかりませんでした。URLを確認してください';
      default:
        return '再生リストの取得に失敗しました';
    }
  }

  const canSubmit =
    !!preview &&
    preview.playlist.isPublic &&
    preview.channelMatches &&
    !preview.playlistAlreadyRegistered &&
    !!selectedGame &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit || !selectedGame) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const idToken = await getIdToken();
      const res = await fetch('/api/playlists/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          playlistUrl,
          gameId: selectedGame.id,
          channelDescription: preview?.channelAlreadyRegistered ? undefined : channelDescription,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(registerErrorMessage(body.error));
        return;
      }
      setCompletion(body as CompletionResult);
    } catch {
      setSubmitError('送信に失敗しました。時間をおいて再試行してください');
    } finally {
      setSubmitting(false);
    }
  }

  function registerErrorMessage(code: string): string {
    switch (code) {
      case 'already_registered':
        return 'この再生リストはすでに登録されています';
      case 'game_not_found':
        return 'ゲームタイトルが見つかりませんでした';
      default:
        return '送信に失敗しました。時間をおいて再試行してください';
    }
  }

  function resetForm() {
    setPlaylistUrl('');
    setPreview(null);
    setPreviewError(null);
    setSelectedGame(null);
    setChannelDescription('');
    setSubmitError(null);
    setCompletion(null);
  }

  if (loading) return <p>読み込み中...</p>;
  if (!user) return <p>ログインしてください。</p>;
  if (!isAdmin) return <p>このページは管理者のみアクセスできます。</p>;

  if (completion) {
    return (
      <div>
        <h1>✅ 登録が完了しました</h1>
        <img src={completion.thumbnailUrl} alt="" width={200} />
        <p>{completion.title}</p>
        <p>
          <img src={completion.channelIconUrl} alt="" width={24} style={{ borderRadius: '50%' }} />{' '}
          {completion.channelName}
        </p>
        <p>🎮 {completion.gameName}</p>
        <p>動画数: {completion.videoCount}本</p>
        <a href={`/playlists/${completion.playlistId}`}>再生リストを見る</a>{' '}
        <button onClick={resetForm}>続けて登録する</button>
      </div>
    );
  }

  return (
    <div>
      <h1>再生リストを追加する</h1>

      <label>
        再生リストURL
        <input
          type="text"
          placeholder="https://www.youtube.com/playlist?list=..."
          value={playlistUrl}
          onChange={(e) => setPlaylistUrl(e.target.value)}
          onBlur={handleUrlBlur}
          style={{ width: '100%' }}
        />
      </label>
      <p>⚠ チャンネルが作成・公開している再生リストのみ登録できます</p>

      {previewLoading && <p>取得中...</p>}
      {previewError && <p style={{ color: 'red' }}>{previewError}</p>}

      {preview && (
        <div style={{ border: '1px solid #ccc', padding: 8 }}>
          <img src={preview.playlist.thumbnailUrl} alt="" width={160} />
          <p>{preview.playlist.title}</p>
          <p>
            <img src={preview.channel.iconUrl} alt="" width={24} style={{ borderRadius: '50%' }} />{' '}
            {preview.channel.name}
          </p>
          <p>動画数: {preview.playlist.itemCount}本</p>

          {preview.playlist.isPublic ? (
            <p>✅ 公開されている再生リストです</p>
          ) : (
            <p style={{ color: 'red' }}>❌ この再生リストは非公開または限定公開のため登録できません</p>
          )}
          {preview.playlist.isPublic && (
            preview.channelMatches ? (
              <p>✅ チャンネルが作成した再生リストです</p>
            ) : (
              <p style={{ color: 'red' }}>❌ チャンネルが作成した再生リストではないため登録できません</p>
            )
          )}
          {preview.playlistAlreadyRegistered && (
            <p style={{ color: 'red' }}>❌ この再生リストはすでに登録されています</p>
          )}

          {preview.playlist.isPublic && preview.channelMatches && (
            preview.channelAlreadyRegistered ? (
              <p>✅ プレミテ登録済みチャンネルです。再生リストと紐づけます。</p>
            ) : (
              <div>
                <p>ℹ️ 未登録のチャンネルです。再生リスト登録と同時に新規チャンネルとして登録します。</p>
                <label>
                  チャンネルの説明文（任意・手入力）
                  <textarea
                    value={channelDescription}
                    onChange={(e) => setChannelDescription(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </label>
              </div>
            )
          )}
        </div>
      )}

      <div>
        <p>ゲームタイトル</p>
        {selectedGame ? (
          <span>
            {selectedGame.title} <button onClick={() => setSelectedGame(null)}>×</button>
          </span>
        ) : (
          <button onClick={() => setGameModalOpen(true)}>ゲームタイトルを選択する</button>
        )}
      </div>

      {gameModalOpen && (
        <div style={{ border: '1px solid #333', padding: 8, marginTop: 8 }}>
          <div>
            ゲームタイトルを選択 <button onClick={() => setGameModalOpen(false)}>×</button>
          </div>
          <input
            type="text"
            placeholder="ゲームタイトルを検索..."
            value={gameSearch}
            onChange={(e) => setGameSearch(e.target.value)}
            style={{ width: '100%' }}
          />
          <ul>
            {games
              .filter((g) => g.title.includes(gameSearch))
              .map((g) => (
                <li key={g.id}>
                  <button
                    onClick={() => {
                      setSelectedGame(g);
                      setGameModalOpen(false);
                      setGameSearch('');
                    }}
                  >
                    {g.title}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      {submitError && <p style={{ color: 'red' }}>{submitError}</p>}

      <div>
        <button onClick={handleSubmit} disabled={!canSubmit}>
          登録する
        </button>
      </div>
    </div>
  );
}
