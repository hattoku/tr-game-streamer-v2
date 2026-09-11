'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
  setDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../../contexts/AuthContext';

// 再生リスト詳細ページの最小版（動作確認用、スタイリングなし。他のページと同じ方針）。
// document/specification/page/ページ 再生リスト詳細ページにおける動画プレーヤー 仕様書.md 準拠。
// 仕様書自身の「非スコープ」に加え、今回さらに以下をスコープ外とした
// （wiki/sources/2026-09-10-phase2-plan.md参照）:
// - レビュー投稿・配信者情報・ゲーム情報セクション（別仕様書、フェーズ3以降）
// - シアターモードの黒背景等の視覚デザイン（トグルの状態管理のみ実装）
// - 未ログインユーザーの視聴進捗LocalStorage保存（ゲストは進捗が保存されない）
// - 逆順トグルはマイリスト登録済みの場合のみFirestoreに永続化する（mylist.isReverseOrderを
//   共有）。マイリスト未登録の場合はこのページ内のローカル状態のみ（セッション限り）
// - 動画リストの「現在再生中の動画まで自動スクロール」（DOM操作の見た目の話のため見送り）

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface PlaylistDoc {
  title: string;
  thumbnailUrl: string;
  channelName: string;
  channelIconUrl: string;
  referenceUrl: string;
  videoCount: number;
}

interface VideoDoc {
  id: string;
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  position: number;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatRemaining(remainingSeconds: number): string {
  return `残り${Math.floor(remainingSeconds / 60)}分`;
}

let ytApiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve();
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(tag);
  });
  return ytApiPromise;
}

export default function PlaylistDetailPage() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const { user, loading: authLoading } = useAuth();

  const [playlist, setPlaylist] = useState<PlaylistDoc | null>(null);
  const [videos, setVideos] = useState<VideoDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [reverseOrder, setReverseOrder] = useState(false);
  const [mylistDocId, setMylistDocId] = useState<string | null>(null);
  const [continuousPlay, setContinuousPlay] = useState(true);
  const [theaterMode, setTheaterMode] = useState(false);

  const [playerStarted, setPlayerStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resumeSeconds, setResumeSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [watchHistory, setWatchHistory] = useState<Record<string, number>>({});

  const playerRef = useRef<any>(null);
  const playerReadyRef = useRef(false);
  const currentVideoRef = useRef<VideoDoc | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const orderedVideos = reverseOrder ? [...videos].slice().reverse() : videos;
  const currentVideo = orderedVideos[currentIndex] ?? null;

  useEffect(() => {
    currentVideoRef.current = currentVideo;
  }, [currentVideo]);

  // 初期データ読み込み
  useEffect(() => {
    if (!playlistId || authLoading) return;

    (async () => {
      setLoading(true);
      const playlistSnap = await getDoc(doc(db, 'playlists', playlistId));
      if (!playlistSnap.exists()) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const p = playlistSnap.data();
      setPlaylist({
        title: p.title,
        thumbnailUrl: p.thumbnailUrl,
        channelName: p.channelName,
        channelIconUrl: p.channelIconUrl,
        referenceUrl: p.referenceUrl,
        videoCount: p.videoCount,
      });

      const videosSnap = await getDocs(
        query(collection(db, 'videos'), where('playlistId', '==', playlistId), orderBy('position', 'asc')),
      );
      const videoList: VideoDoc[] = videosSnap.docs.map((d) => ({
        id: d.id,
        youtubeVideoId: d.data().youtubeVideoId,
        title: d.data().title,
        thumbnailUrl: d.data().thumbnailUrl,
        durationSeconds: d.data().durationSeconds ?? null,
        position: d.data().position,
      }));
      setVideos(videoList);

      if (user) {
        const mylistSnap = await getDoc(doc(db, 'mylist', `${user.uid}_${playlistId}`));
        if (mylistSnap.exists()) {
          setMylistDocId(mylistSnap.id);
          setReverseOrder(mylistSnap.data().isReverseOrder ?? false);
        }

        const userSnap = await getDoc(doc(db, 'users', user.uid));
        setContinuousPlay(userSnap.data()?.isContinuousPlayEnabled ?? true);

        const historySnap = await getDocs(
          query(collection(db, 'watch_history'), where('userId', '==', user.uid), where('playlistId', '==', playlistId)),
        );
        const historyMap: Record<string, number> = {};
        historySnap.docs.forEach((d) => {
          historyMap[d.data().youtubeVideoId] = d.data().progressPercent;
        });
        setWatchHistory(historyMap);

        const progressSnap = await getDocs(
          query(
            collection(db, 'watch_progress'),
            where('userId', '==', user.uid),
            where('playlistId', '==', playlistId),
            orderBy('updatedAt', 'desc'),
            limit(1),
          ),
        );
        const lastProgress = progressSnap.docs[0]?.data();
        if (lastProgress) {
          const idx = videoList.findIndex((v) => v.youtubeVideoId === lastProgress.youtubeVideoId);
          if (idx >= 0) {
            setCurrentIndex(idx);
            setResumeSeconds(lastProgress.lastPlayedSeconds ?? 0);
          }
        }
      }

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId, user, authLoading]);

  async function recordEpisodeOpened(video: VideoDoc, startSeconds: number) {
    if (!user || !playlistId) return;
    await setDoc(doc(db, 'watch_progress', `${user.uid}_${playlistId}_${video.youtubeVideoId}`), {
      userId: user.uid,
      playlistId,
      youtubeVideoId: video.youtubeVideoId,
      lastPlayedSeconds: startSeconds,
      updatedAt: serverTimestamp(),
    });
  }

  async function saveProgress(video: VideoDoc, seconds: number) {
    if (!user || !playlistId) return;
    await setDoc(doc(db, 'watch_progress', `${user.uid}_${playlistId}_${video.youtubeVideoId}`), {
      userId: user.uid,
      playlistId,
      youtubeVideoId: video.youtubeVideoId,
      lastPlayedSeconds: seconds,
      updatedAt: serverTimestamp(),
    });
    const percent = video.durationSeconds ? Math.min(100, Math.round((seconds / video.durationSeconds) * 100)) : 0;
    await setDoc(doc(db, 'watch_history', `${user.uid}_${video.youtubeVideoId}`), {
      userId: user.uid,
      playlistId,
      youtubeVideoId: video.youtubeVideoId,
      progressPercent: percent,
      watchedAt: serverTimestamp(),
    });
    setWatchHistory((prev) => ({ ...prev, [video.youtubeVideoId]: percent }));
  }

  function startInterval() {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      const player = playerRef.current;
      const video = currentVideoRef.current;
      if (!player || !video || typeof player.getCurrentTime !== 'function') return;
      const seconds = Math.floor(player.getCurrentTime());
      saveProgress(video, seconds);
    }, 5000);
  }

  async function initPlayer(video: VideoDoc, startSeconds: number) {
    await loadYouTubeApi();
    playerRef.current = new window.YT.Player('yt-player-target', {
      videoId: video.youtubeVideoId,
      playerVars: { autoplay: 1, start: Math.floor(startSeconds) },
      events: {
        onReady: () => {
          playerReadyRef.current = true;
          startInterval();
        },
        onStateChange: (e: any) => {
          const YT = window.YT;
          if (e.data === YT.PlayerState.PLAYING) setIsPlaying(true);
          if (e.data === YT.PlayerState.PAUSED) setIsPlaying(false);
          if (e.data === YT.PlayerState.ENDED) {
            if (video.durationSeconds) saveProgress(video, video.durationSeconds);
            if (continuousPlay) goToRelative(1, true);
          }
        },
      },
    });
  }

  async function handleStart() {
    setPlayerStarted(true);
    const video = orderedVideos[currentIndex];
    if (!video) return;
    await recordEpisodeOpened(video, resumeSeconds);
    if (playerReadyRef.current && playerRef.current) {
      playerRef.current.loadVideoById({ videoId: video.youtubeVideoId, startSeconds: resumeSeconds });
    } else {
      await initPlayer(video, resumeSeconds);
    }
  }

  async function goToRelative(delta: number, auto: boolean) {
    const nextIndex = currentIndex + delta;
    const nextVideo = orderedVideos[nextIndex];
    if (!nextVideo) return;
    setCurrentIndex(nextIndex);
    setResumeSeconds(0);
    await recordEpisodeOpened(nextVideo, 0);
    if (playerRef.current) {
      playerRef.current.loadVideoById({ videoId: nextVideo.youtubeVideoId, startSeconds: 0 });
    } else if (auto) {
      await initPlayer(nextVideo, 0);
    }
  }

  async function jumpTo(index: number) {
    const video = orderedVideos[index];
    if (!video) return;
    setCurrentIndex(index);
    setResumeSeconds(0);
    if (!playerStarted) {
      setPlayerStarted(true);
      await recordEpisodeOpened(video, 0);
      await initPlayer(video, 0);
      return;
    }
    await recordEpisodeOpened(video, 0);
    playerRef.current?.loadVideoById({ videoId: video.youtubeVideoId, startSeconds: 0 });
  }

  function togglePlayPause() {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying) player.pauseVideo();
    else player.playVideo();
  }

  async function handleReverseToggle(value: boolean) {
    setReverseOrder(value);
    setCurrentIndex(0);
    if (user && mylistDocId) {
      await updateDoc(doc(db, 'mylist', mylistDocId), { isReverseOrder: value, updatedAt: serverTimestamp() });
    }
  }

  async function handleContinuousPlayToggle(value: boolean) {
    setContinuousPlay(value);
    if (user) {
      await updateDoc(doc(db, 'users', user.uid), { isContinuousPlayEnabled: value });
    }
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (authLoading || loading) return <p>読み込み中...</p>;
  if (notFound || !playlist) return <p>再生リストが見つかりませんでした。</p>;

  const resumeVideoDuration = currentVideo?.durationSeconds ?? null;
  const remaining = resumeVideoDuration != null ? Math.max(0, resumeVideoDuration - resumeSeconds) : null;

  return (
    <div>
      <h1>{playlist.title}</h1>
      <p>
        <img src={playlist.channelIconUrl} alt="" width={24} style={{ borderRadius: '50%' }} /> {playlist.channelName}
      </p>
      <p>動画数: {playlist.videoCount}本</p>
      <p>
        <a href={playlist.referenceUrl} target="_blank" rel="noreferrer">
          YouTubeで見る
        </a>
      </p>

      <div style={theaterMode ? { maxWidth: '100%' } : { maxWidth: 640 }}>
        {!playerStarted ? (
          <div>
            <img
              src={currentVideo?.thumbnailUrl ?? playlist.thumbnailUrl}
              alt=""
              style={{ width: '100%', cursor: 'pointer' }}
              onClick={handleStart}
            />
            <button onClick={handleStart}>{resumeSeconds > 0 ? '続きから再生する' : '再生する'}</button>
            {resumeSeconds > 0 && resumeVideoDuration != null && (
              <div>
                <progress value={resumeSeconds} max={resumeVideoDuration} />
                <span>{remaining != null && formatRemaining(remaining)}</span>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div id="yt-player-target" style={{ aspectRatio: '16/9', width: '100%' }} />
            <div>
              <button onClick={() => goToRelative(-1, false)} disabled={currentIndex <= 0}>
                ◀ 前へ
              </button>
              <button onClick={togglePlayPause}>{isPlaying ? '一時停止' : '再生'}</button>
              <button onClick={() => goToRelative(1, false)} disabled={currentIndex >= orderedVideos.length - 1}>
                次へ ▶
              </button>
              <button onClick={() => setTheaterMode((v) => !v)}>シアターモード</button>
              <label>
                <input
                  type="checkbox"
                  checked={continuousPlay}
                  onChange={(e) => handleContinuousPlayToggle(e.target.checked)}
                />
                連続再生
              </label>
            </div>
          </div>
        )}
      </div>

      <label>
        <input type="checkbox" checked={reverseOrder} onChange={(e) => handleReverseToggle(e.target.checked)} />
        逆順で表示・再生
        {user && !mylistDocId && '（マイリスト未登録のため、この設定は保存されません）'}
      </label>

      <h2>動画リスト（全{orderedVideos.length}話）</h2>
      {orderedVideos.map((video, index) => (
        <div
          key={video.id}
          style={{
            border: '1px solid #ccc',
            padding: 4,
            marginBottom: 4,
            background: index === currentIndex ? '#eee' : undefined,
            cursor: 'pointer',
          }}
          onClick={() => jumpTo(index)}
        >
          {index === currentIndex && '▶ '}
          <img src={video.thumbnailUrl} alt="" width={120} />
          <span>{video.title}</span>
          <span> {formatDuration(video.durationSeconds)}</span>
          {watchHistory[video.youtubeVideoId] != null && (
            <progress value={watchHistory[video.youtubeVideoId]} max={100} />
          )}
        </div>
      ))}
    </div>
  );
}
