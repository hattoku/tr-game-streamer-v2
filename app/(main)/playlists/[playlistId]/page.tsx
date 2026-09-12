'use client';

import { useEffect, useRef, useState } from 'react';
import { notFound, useParams } from 'next/navigation';
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
  setDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLayout } from '@/components/layout/LayoutContext';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/Card';
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { AddToMylistButton, type MylistState } from '@/components/playlists/AddToMylistButton';
import { ChannelCard } from '@/components/playlists/ChannelCard';
import { PlaylistInfoCard } from '@/components/playlists/PlaylistInfoCard';
import { VideoList, type VideoItem } from '@/components/playlists/VideoList';
import type { WatchStatus } from '@/components/ui/Chip';

// 再生リスト詳細ページ。
// document/specification/page/ページ 再生リスト詳細 仕様書.md（レイアウト・基本情報・配信者情報）と
// ページ 再生リスト詳細ページにおける動画プレーヤー 仕様書.md（プレーヤー・再生制御・動画リスト・
// 視聴進捗・シアターモード・連続再生）準拠。フェーズ2.5ステップ3でデザイン適用
// （wiki/sources/2026-09-11-phase2.5-design-plan.md §4）。
// 引き続きスコープ外:
// - レビュー投稿・ゲーム情報セクション（別仕様書、フェーズ3以降）
// - 未ログインユーザーの視聴進捗LocalStorage保存（ゲストは進捗が保存されない）
// - 逆順トグルはマイリスト登録済みの場合のみFirestoreに永続化（mylist.isReverseOrderを共有）。
//   未登録の場合はこのページ内のローカル状態のみ（セッション限り）
// - playlists.mylistCount の加算（クライアントからは更新できないルール。サーバー側集計はフェーズ3）

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface PlaylistDoc {
  title: string;
  thumbnailUrl: string;
  channelId: string;
  channelName: string;
  channelIconUrl: string;
  referenceUrl: string;
  videoCount: number;
  score: number | null;
  reviewCount: number;
  mylistCount: number;
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
  const { setCompactHeader } = useLayout();

  const [playlist, setPlaylist] = useState<PlaylistDoc | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const [reverseOrder, setReverseOrder] = useState(false);
  const [mylist, setMylist] = useState<MylistState | null>(null);
  const [continuousPlay, setContinuousPlay] = useState(true);
  const [theaterMode, setTheaterMode] = useState(false);

  const [playerStarted, setPlayerStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resumeSeconds, setResumeSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [watchHistory, setWatchHistory] = useState<Record<string, number>>({});

  const playerRef = useRef<any>(null);
  const playerReadyRef = useRef(false);
  const currentVideoRef = useRef<VideoItem | null>(null);
  const continuousPlayRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const orderedVideos = reverseOrder ? [...videos].reverse() : videos;
  const currentVideo = orderedVideos[currentIndex] ?? null;

  useEffect(() => {
    currentVideoRef.current = currentVideo;
  }, [currentVideo]);
  useEffect(() => {
    continuousPlayRef.current = continuousPlay;
  }, [continuousPlay]);

  // シアターモード: ヘッダーを 30px・黒背景に（動画プレーヤー仕様書「シアターモード」）。
  // ページを離れたらリセット（状態は保持しない仕様）
  useEffect(() => {
    setCompactHeader(theaterMode);
    return () => setCompactHeader(false);
  }, [theaterMode, setCompactHeader]);

  // 初期データ読み込み
  useEffect(() => {
    if (!playlistId || authLoading) return;

    (async () => {
      setLoading(true);
      const playlistSnap = await getDoc(doc(db, 'playlists', playlistId));
      if (!playlistSnap.exists()) {
        setMissing(true);
        setLoading(false);
        return;
      }
      const p = playlistSnap.data();
      setPlaylist({
        title: p.title,
        thumbnailUrl: p.thumbnailUrl,
        channelId: p.channelId ?? '',
        channelName: p.channelName,
        channelIconUrl: p.channelIconUrl,
        referenceUrl: p.referenceUrl,
        videoCount: p.videoCount,
        score: p.score ?? null,
        reviewCount: p.reviewCount ?? 0,
        mylistCount: p.mylistCount ?? 0,
      });

      const videosSnap = await getDocs(
        query(collection(db, 'videos'), where('playlistId', '==', playlistId), orderBy('position', 'asc')),
      );
      const videoList: VideoItem[] = videosSnap.docs.map((d) => ({
        id: d.id,
        youtubeVideoId: d.data().youtubeVideoId,
        title: d.data().title,
        thumbnailUrl: d.data().thumbnailUrl,
        durationSeconds: d.data().durationSeconds ?? null,
      }));
      setVideos(videoList);

      if (user) {
        const mylistSnap = await getDoc(doc(db, 'mylist', `${user.uid}_${playlistId}`));
        let reverse = false;
        if (mylistSnap.exists()) {
          setMylist({ docId: mylistSnap.id, status: (mylistSnap.data().watchStatus as WatchStatus) ?? 'want_to_watch' });
          reverse = mylistSnap.data().isReverseOrder ?? false;
          setReverseOrder(reverse);
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
          const ordered = reverse ? [...videoList].reverse() : videoList;
          const idx = ordered.findIndex((v) => v.youtubeVideoId === lastProgress.youtubeVideoId);
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

  async function recordEpisodeOpened(video: VideoItem, startSeconds: number) {
    if (!user || !playlistId) return;
    await setDoc(doc(db, 'watch_progress', `${user.uid}_${playlistId}_${video.youtubeVideoId}`), {
      userId: user.uid,
      playlistId,
      youtubeVideoId: video.youtubeVideoId,
      lastPlayedSeconds: startSeconds,
      updatedAt: serverTimestamp(),
    });
  }

  async function saveProgress(video: VideoItem, seconds: number) {
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

  async function initPlayer(video: VideoItem, startSeconds: number) {
    await loadYouTubeApi();
    playerRef.current = new window.YT.Player('yt-player-target', {
      // マウント先の div は iframe に置き換えられるため、親（aspect-video の箱）いっぱいのサイズを明示する
      width: '100%',
      height: '100%',
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
            const ended = currentVideoRef.current;
            if (ended?.durationSeconds) saveProgress(ended, ended.durationSeconds);
            if (continuousPlayRef.current) goToRelative(1, true);
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
    if (user && mylist) {
      await updateDoc(doc(db, 'mylist', mylist.docId), { isReverseOrder: value, updatedAt: serverTimestamp() });
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

  if (missing) notFound();

  if (authLoading || loading || !playlist) {
    return <DetailSkeleton />;
  }

  const resumeVideoDuration = currentVideo?.durationSeconds ?? null;
  const remaining = resumeVideoDuration != null ? Math.max(0, resumeVideoDuration - resumeSeconds) : null;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < orderedVideos.length - 1;

  // ---- ヒーローセクション（プレーヤー＋コントローラ） ----
  // 注意: YouTube プレーヤー（iframe）を破棄しないよう、シアターモードの切替では DOM 構造を変えず
  // クラスだけを切り替える（親要素が変わると React が再マウントし、再生中の動画が止まる）
  const hero = (
    <div className={cn(theaterMode && '-mx-4 -mt-6 bg-bg-player px-4 pt-4 md:-mx-6 md:-mt-8 md:px-6')}>
      <div className={cn('relative aspect-video w-full overflow-hidden bg-bg-player', !theaterMode && 'rounded-[12px] shadow-card')}>
        {/* プレーヤーのマウント先は常に置いておき、開始前はサムネイルを重ねる */}
        <div id="yt-player-target" className="absolute inset-0 size-full" />
        {!playerStarted && (
          <button
            type="button"
            onClick={handleStart}
            aria-label={resumeSeconds > 0 ? '続きから再生する' : '再生する'}
            className="group absolute inset-0 flex items-center justify-center bg-bg-player"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentVideo?.thumbnailUrl || playlist.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-[46%] bg-thumb-overlay" />
            {/* 再生ボタン（トークン仕様書 v2.0 §6.5）。ヒーローは大きめの 64px */}
            <span className="relative inline-flex size-16 items-center justify-center rounded-full bg-gradient-primary text-white shadow-primary transition-transform duration-[120ms] group-hover:scale-105">
              <PlayIcon size={30} />
            </span>
          </button>
        )}
      </div>

      <div className={cn('mt-3 flex flex-col gap-3', theaterMode && 'pb-4')}>
        {!playerStarted ? (
          <div className="flex flex-col gap-2 sm:max-w-[320px]">
            <Button variant="primary" size="full" onClick={handleStart}>
              <PlayIcon size={14} />
              {resumeSeconds > 0 ? '続きから再生する' : '再生する'}
            </Button>
            {resumeSeconds > 0 && resumeVideoDuration != null && (
              <div className="flex items-center gap-3">
                <ProgressBar value={resumeSeconds} max={resumeVideoDuration} className="flex-1" label="前回の再生位置" />
                {remaining != null && <span className="shrink-0 text-md text-text-muted">{formatRemaining(remaining)}</span>}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {hasPrev && (
              <Button variant="secondary" onClick={() => goToRelative(-1, false)}>
                <ChevronLeftIcon size={14} />
                前へ
              </Button>
            )}
            <Button variant="secondary" onClick={togglePlayPause} aria-label={isPlaying ? '一時停止' : '再生'}>
              {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
              {isPlaying ? '一時停止' : '再生'}
            </Button>
            {hasNext && (
              <Button variant="secondary" onClick={() => goToRelative(1, false)}>
                次へ
                <ChevronRightIcon size={14} />
              </Button>
            )}
            <Button variant="secondary" active={theaterMode} onClick={() => setTheaterMode((v) => !v)}>
              シアター{theaterMode ? '解除' : ''}
            </Button>
            <Checkbox label="連続再生" checked={continuousPlay} onChange={(e) => handleContinuousPlayToggle(e.target.checked)} className="ml-1" />
          </div>
        )}
      </div>
    </div>
  );

  const infoCard = (
    <PlaylistInfoCard
      title={playlist.title}
      score={playlist.score}
      mylistCount={playlist.mylistCount}
      reviewCount={playlist.reviewCount}
      tags={[]}
      referenceUrl={playlist.referenceUrl}
      mylistAction={<AddToMylistButton playlistId={playlistId} user={user} mylist={mylist} onChange={setMylist} />}
    />
  );

  const videoList = (
    <VideoList
      videos={orderedVideos}
      currentIndex={currentIndex}
      progressByVideo={watchHistory}
      reverseOrder={reverseOrder}
      reverseNote={user && !mylist ? 'マイリスト未登録のため、逆順の設定は保存されません' : undefined}
      onReverseToggle={handleReverseToggle}
      onSelect={jumpTo}
    />
  );

  const channelCard = <ChannelCard channelId={playlist.channelId} name={playlist.channelName} iconUrl={playlist.channelIconUrl} />;

  // 通常モード: PC 2カラム（左 62% / 右 38%: ヒーロー | 基本情報・動画リスト・配信者）、
  //             モバイルは ヒーロー→基本情報→動画リスト→配信者 の縦積み
  // シアターモード: ヒーローを全幅・黒背景で最上部に、その下に 基本情報 | 動画リスト・配信者 の2カラム
  // （いずれも DOM 順は同じで、クラスの切替のみ）
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[62fr_38fr]">
      <div className={cn('flex flex-col gap-4', theaterMode && 'md:col-span-2')}>
        {hero}
        <div className="md:hidden">{infoCard}</div>
      </div>
      <div
        className={cn(
          'flex flex-col gap-4',
          theaterMode && 'md:col-span-2 md:grid md:grid-cols-[62fr_38fr] md:items-start md:gap-6',
        )}
      >
        <div className="hidden md:block">{infoCard}</div>
        <div className="flex flex-col gap-4">
          {videoList}
          {channelCard}
        </div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[62fr_38fr]" aria-busy="true" aria-label="読み込み中">
      <div className="flex flex-col gap-3">
        <Skeleton className="aspect-video w-full rounded-[12px]" />
        <Skeleton className="h-10 w-[200px]" />
      </div>
      <div className="flex flex-col gap-4">
        <Card>
          <SkeletonText lines={3} />
        </Card>
        <Card flush className="p-3">
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-[68px] w-[120px] shrink-0" />
                <SkeletonText lines={2} className="flex-1" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
