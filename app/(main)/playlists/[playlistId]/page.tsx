'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, where, orderBy, limit,
  setDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLayout } from '@/components/layout/LayoutContext';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { Card } from '@/components/ui/Card';
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { ChannelCard } from '@/components/playlists/ChannelCard';
import { GameInfoCard } from '@/components/playlists/GameInfoCard';
import { ContainingCollectionsCard } from '@/components/collections/ContainingCollectionsCard';
import { PlaylistInfoCard } from '@/components/playlists/PlaylistInfoCard';
import { VideoList, type VideoItem } from '@/components/playlists/VideoList';
import { PlayerOsd, OSD_DURATION_MS } from '@/components/playlists/PlayerOsd';
import { PlayerShortcutsModal } from '@/components/playlists/PlayerShortcutsModal';
import { usePlayerShortcuts, type ShortcutAction } from '@/components/playlists/usePlayerShortcuts';
import { ReviewSection } from '@/components/reviews/ReviewSection';
import { useOwnReview, type MylistState } from '@/components/reviews/useOwnReview';
import { PlaylistFinishedModal, type FinishedPromptSections } from '@/components/reviews/PlaylistFinishedModal';
import { LoginRequiredModal } from '@/components/layout/LoginRequiredModal';
import { TagEditModal } from '@/components/tags/TagEditModal';
import { fetchTagsMap, resolveTags, type ResolvedTag } from '@/lib/tags';
import { normalizeWatchStatus } from '@/components/ui/Chip';
import { IS_PROD } from '@/lib/app-env';

// 再生リスト詳細ページ。
// document/specification/page/ページ 再生リスト詳細 仕様書.md（レイアウト・基本情報・配信者情報）と
// ページ 再生リスト詳細ページにおける動画プレーヤー 仕様書.md（プレーヤー・再生制御・動画リスト・
// 視聴進捗・シアターモード・連続再生）準拠。フェーズ2.5ステップ3でデザイン適用
// （wiki/sources/2026-09-11-phase2.5-design-plan.md §4）。
// レビュー投稿セクション（フェーズ3ステップ1）: PC版は左カラム（ヒーロー直下）、モバイル版は
// 動画リスト直後という配置差があるため、PlaylistInfoCardと同じ「2箇所にレンダリングし
// 片方をCSSで隠す」パターンで配置する（下記 reviewSection 変数参照）。
// 関連ゲームセクション（2026-09-26、2026-10-15 に「ゲーム情報」から改称）: 右カラムの最後（モバイルもページ最後）に
// GameInfoCard を置く。再生リストに gameId が無い（ゲーム未紐づけ）場合は表示しない。
// まとめの発見導線（2026-10-12）: 関連ゲームの下に「この再生リストを含むまとめ」（ContainingCollectionsCard）。
// ネタバレ対策（2026-09-26）: 配信者情報を動画リストの上へ移動し（スマホのファーストビューで
// 動画リストを下げるため）、動画リストは約3話分の高さに抑える（VideoList 参照）。設定
// 「先の話のサムネイルを隠す」（users.hideUpcomingThumbnails）がONなら到達済みより先の話を隠す。
// キーボードショートカット（2026-10-03）: YouTube の動画ページに合わせたキー操作（動画プレーヤー仕様書
// 「キーボード操作」）。キー判定は usePlayerShortcuts、操作表示は PlayerOsd、一覧は PlayerShortcutsModal。
// 最終話の再生終了時（2026-10-07）: 表示順で最後の動画を見終えたら全画面を解除し、完走の確認と
// レビューを促すダイアログ（PlaylistFinishedModal）を出す（動画プレーヤー仕様書「最終話の再生終了時」）。
// 引き続きスコープ外:
// - 未ログインユーザーの視聴進捗LocalStorage保存（ゲストは進捗が保存されない）
// - 逆順トグルはマイリスト登録済みの場合のみFirestoreに永続化（mylist.isReverseOrderを共有）。
//   未登録の場合はこのページ内のローカル状態のみ（セッション限り）
// - playlists.mylistCount の加算（クライアントからは更新できないルール。フェーズ3ステップ1の
//   スコープ外。既知の未解決事項として残る）

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

interface GameInfo {
  gameId: string;
  title: string;
  packageImageUrl: string | null;
  rakutenUrl: string | null;
  genreName: string;
  themeNames: string[];
  tags: ResolvedTag[];
}

// 関連ゲームセクション（ページ 再生リスト詳細 仕様書「関連ゲームセクション」）用に
// games ドキュメントとテーマ名・タグを解決する。
// games/themes は誰でも読めるため未ログインでも取得できる。ゲームが存在しなければ null
async function fetchGameInfo(gameId: string): Promise<GameInfo | null> {
  const [gameSnap, themesSnap, tagsMap] = await Promise.all([
    getDoc(doc(db, 'games', gameId)),
    getDocs(collection(db, 'themes')),
    fetchTagsMap(),
  ]);
  if (!gameSnap.exists()) return null;
  const g = gameSnap.data();
  const themeNameById = new Map(themesSnap.docs.map((d) => [d.id, (d.data().name as string) ?? '']));
  return {
    gameId,
    title: g.title ?? '',
    packageImageUrl: g.packageImageUrl ?? null,
    rakutenUrl: g.rakutenUrl ?? null,
    genreName: g.genreName ?? '',
    themeNames: ((g.themeIds ?? []) as string[]).map((id) => themeNameById.get(id)).filter((n): n is string => !!n),
    tags: resolveTags(g.gameTagIds ?? [], g.gameTagsFixed ?? [], tagsMap),
  };
}

// 設定「先の話のサムネイルを隠す」の対象（動画プレーヤー仕様書「先の話のサムネイルを隠す（ユーザー設定）」）。話の順番（videos は position 昇順）で判定するため逆順表示でも変わらない。
// 到達済みライン＝現在の話と、視聴履歴がある話のうち最も先の位置。それより後の話を隠す
function upcomingVideoIds(videos: VideoItem[], current: VideoItem | null, watchHistory: Record<string, number>): Set<string> {
  let frontier = current ? videos.findIndex((v) => v.id === current.id) : -1;
  videos.forEach((v, i) => {
    if (watchHistory[v.youtubeVideoId] != null && i > frontier) frontier = i;
  });
  return new Set(videos.slice(frontier + 1).map((v) => v.id));
}

function formatRemaining(remainingSeconds: number): string {
  return `残り${Math.floor(remainingSeconds / 60)}分`;
}

// スリープや長時間のタブ非表示から戻ったとみなす空白時間。これを超えて止まっていた埋め込みプレーヤーは
// 「この動画は再生できません（エラーコード 152-18）」で使えなくなることがあるため、作り直す
// （動画プレーヤー仕様書「プレーヤーの不調からの復帰」）
const STALE_PLAYER_GAP_MS = 10 * 60 * 1000;
const WAKE_CHECK_INTERVAL_MS = 30 * 1000;
// プレーヤーのエラーで自動的に作り直すのは、この間隔に1回まで。続けてエラーになったら再読み込みを案内する
const AUTO_REBUILD_COOLDOWN_MS = 60 * 1000;

// 再生位置の端末内の控え（LocalStorage）。Firestore への書き込みが間に合わない・届かない場合
// （ページを閉じる直前、スリープ復帰直後のオフラインなど）でも再開位置を失わないようにする
// （動画プレーヤー仕様書「再生時間の記録タイミング」）
interface LocalProgress {
  youtubeVideoId: string;
  seconds: number;
  at: number;
}

function localProgressKey(uid: string, playlistId: string): string {
  return `puremite:watch-progress:${uid}:${playlistId}`;
}

function readLocalProgress(uid: string, playlistId: string): LocalProgress | null {
  try {
    const raw = window.localStorage.getItem(localProgressKey(uid, playlistId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.youtubeVideoId !== 'string' || typeof v?.seconds !== 'number' || typeof v?.at !== 'number') return null;
    return v;
  } catch {
    return null;
  }
}

function writeLocalProgress(uid: string, playlistId: string, youtubeVideoId: string, seconds: number) {
  try {
    const value: LocalProgress = { youtubeVideoId, seconds, at: Date.now() };
    window.localStorage.setItem(localProgressKey(uid, playlistId), JSON.stringify(value));
  } catch {
    // プライベートブラウズ等で使えない場合は Firestore のみ
  }
}

// watch_progress（再開位置）と watch_history（視聴進捗%）を書き込み、視聴進捗%を返す
async function writeProgressDocs(uid: string, playlistId: string, video: VideoItem, seconds: number): Promise<number> {
  await setDoc(doc(db, 'watch_progress', `${uid}_${playlistId}_${video.youtubeVideoId}`), {
    userId: uid,
    playlistId,
    youtubeVideoId: video.youtubeVideoId,
    lastPlayedSeconds: seconds,
    updatedAt: serverTimestamp(),
  });
  const percent = video.durationSeconds ? Math.min(100, Math.round((seconds / video.durationSeconds) * 100)) : 0;
  await setDoc(doc(db, 'watch_history', `${uid}_${video.youtubeVideoId}`), {
    userId: uid,
    playlistId,
    youtubeVideoId: video.youtubeVideoId,
    progressPercent: percent,
    watchedAt: serverTimestamp(),
  });
  return percent;
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
  const { setHeaderHidden } = useLayout();
  const router = useRouter();

  const [playlist, setPlaylist] = useState<PlaylistDoc | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [tags, setTags] = useState<ResolvedTag[]>([]);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [game, setGame] = useState<GameInfo | null>(null);

  const [reverseOrder, setReverseOrder] = useState(false);
  const [mylist, setMylist] = useState<MylistState | null>(null);
  const [continuousPlay, setContinuousPlay] = useState(true);
  const [hideUpcomingThumbnails, setHideUpcomingThumbnails] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);

  const [playerStarted, setPlayerStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resumeSeconds, setResumeSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [watchHistory, setWatchHistory] = useState<Record<string, number>>({});
  // `?autoplay=1` で開かれた際の自動再生の試行中（オーバーレイの▶をスピナーにする）
  const [autoStartPending, setAutoStartPending] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  // プレーヤーの作り直しでも直らないエラーが続いている（再読み込みを案内する）
  const [playerError, setPlayerError] = useState(false);
  // 最終話の再生終了時ダイアログ（動画プレーヤー仕様書「最終話の再生終了時」）。null は非表示
  const [finishedPrompt, setFinishedPrompt] = useState<FinishedPromptSections | null>(null);
  const [finishedLoginOpen, setFinishedLoginOpen] = useState(false);
  // ページを開いている間に一度出したら再び出さない
  const finishedPromptShownRef = useRef(false);
  // ダイアログの「レビューを書く」→ レビューフォームでコメント欄を開く要求（値を変えるたびに発火）
  const [reviewWriteRequest, setReviewWriteRequest] = useState(0);
  const ownReview = useOwnReview(user, playlistId);
  // キーボード操作時の操作表示（PlayerOsd）。id を変えて再マウントし、フェードを毎回やり直す
  const [osd, setOsd] = useState<{ id: number; label: string; icon?: ReactNode } | null>(null);
  const osdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 直近にキーボードで設定した音量・再生位置。setVolume/seekTo 直後の getVolume/getCurrentTime は
  // iframe との往復が済むまで古い値を返すため、押しっぱなし（キーリピート）や連打の間はこちらを基準にする
  const lastVolumeRef = useRef<{ value: number; at: number } | null>(null);
  const lastSeekRef = useRef<{ value: number; at: number } | null>(null);

  const playerRef = useRef<any>(null);
  const playerReadyRef = useRef(false);
  const currentVideoRef = useRef<VideoItem | null>(null);
  const continuousPlayRef = useRef(true);
  // 最新レンダーの goToRelative。YT.Player のイベントハンドラは生成時に一度だけ登録されるため、
  // 直接 goToRelative を呼ぶと生成時点の currentIndex・orderedVideos を参照してしまう
  const goToRelativeRef = useRef<(delta: number, auto: boolean) => void>(() => {});
  // 最新レンダーの handleEnded（goToRelativeRef と同じ理由）
  const handleEndedRef = useRef<() => void>(() => {});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // プレーヤー（iframe）のマウント先。作り直しのたびに中身を新しい要素に差し替えるため、React には子を描画させない
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  // 直近の onStateChange の状態（YT.PlayerState）。イベントハンドラやタイマーから最新値を参照する
  const playerStateRef = useRef<number | null>(null);
  // 最後にプレーヤーから正常に読み取れた再生位置。スリープ復帰直後など不調のプレーヤーは 0 を返すことがあり、
  // その値で保存済みの位置を上書きしないよう、一時停止中・離脱時・エラー時の保存はこちらを使う
  const lastGoodPositionRef = useRef<{ youtubeVideoId: string; seconds: number } | null>(null);
  // 直近に Firestore へ保存した位置（同じ値の書き込みを省く）
  const lastSavedRef = useRef<{ youtubeVideoId: string; seconds: number } | null>(null);
  // 直近にエラーを受けてプレーヤーを作り直した時刻
  const lastErrorRebuildAtRef = useRef(0);
  // 最新レンダーの flushProgress・rebuildPlayer（goToRelativeRef と同じ理由。タイマーやイベントから呼ぶ）
  const flushProgressRef = useRef<() => void>(() => {});
  const rebuildPlayerRef = useRef<() => void>(() => {});
  // 直近の recordEpisodeOpened（fire-and-forget）の書き込み Promise。saveProgress 側がこれを
  // 待ってから書き込むことで、ネットワーク遅延で recordEpisodeOpened が後から Firestore に
  // 届いて進捗を 0 に巻き戻してしまう競合を防ぐ
  const openWriteRef = useRef<Promise<void> | null>(null);
  // 現在プレーヤーに cue（読み込み）済みの動画ID。再生開始前に再生対象が変わった場合の
  // 再同期判定に使う
  const cuedVideoIdRef = useRef<string | null>(null);
  // `?autoplay=1`（マイリストの「続きから再生」ボタン経由）で開かれたか。先読みプレーヤーの
  // onReady で自動再生を試みる
  const autoStartRequestedRef = useRef(false);
  // 自動再生を試行した後、まだ PLAYING を受けていない（＝ユーザー操作なしで開始する経路）
  const autoStartingRef = useRef(false);
  const autoStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 連続再生の自動遷移（ENDED 起点の loadVideoById）直後の再生リトライ状態。
  // iOS Safari ではユーザー操作を伴わない loadVideoById が未開始/cue 状態で止まることがあり、
  // さらに YouTube プレーヤーの全画面表示中は読み込み直後に 0:00 で一時停止されることがある。
  // 遷移から一定時間内にそれらの状態を受けたら、回数を限って playVideo() で再生を促す。
  // 一時停止は 0:00 付近のものだけを対象にし、ユーザーが意図して止めた場合と区別する
  // （動画プレーヤー仕様書「連続再生機能」）
  const autoAdvanceRef = useRef<{ deadline: number; retries: number } | null>(null);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 【一時的なデバッグ表示】stg で `?debug=1` を付けて開いたときだけ、プレーヤーの状態遷移を
  // 画面に出す（iOS 全画面再生時の挙動調査用。調査が済んだら削除する）
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const debugRef = useRef(false);

  const orderedVideos = reverseOrder ? [...videos].reverse() : videos;
  const currentVideo = orderedVideos[currentIndex] ?? null;

  useEffect(() => {
    currentVideoRef.current = currentVideo;
  }, [currentVideo]);
  useEffect(() => {
    continuousPlayRef.current = continuousPlay;
  }, [continuousPlay]);

  // YouTube IFrame API をマウント時に先読みしておく。初回再生時（ボタン押下時）に
  // 初めて読み込むと、ネットワーク待ちが発生してユーザー操作から生成までの間隔が開き、
  // iOS Safari で自動再生が許可されないことがあるため
  useEffect(() => {
    loadYouTubeApi();
  }, []);

  useEffect(() => {
    if (IS_PROD || new URLSearchParams(window.location.search).get('debug') !== '1') return;
    debugRef.current = true;
  }, []);

  function debugLog(message: string) {
    if (!debugRef.current) return;
    const p = playerRef.current;
    const t = typeof p?.getCurrentTime === 'function' ? p.getCurrentTime().toFixed(1) : '-';
    const d = typeof p?.getDuration === 'function' ? p.getDuration().toFixed(1) : '-';
    const now = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    setDebugLines((prev) => [...prev.slice(-29), `${now} ${message} t=${t} d=${d}`]);
  }

  // マイリストの「続きから再生」ボタンからは `?autoplay=1` 付きで遷移してくる（マイリスト機能仕様書 §5.3）。
  // 読み取ったらすぐクエリを除去し、リロードや「戻る」で開き直したときに再び自動再生されないようにする。
  // useSearchParams は Suspense 境界が必要になるため使わず、マウント時に一度だけ location から読む
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('autoplay') !== '1') return;
    autoStartRequestedRef.current = true;
    router.replace(window.location.pathname, { scroll: false });
  }, [router]);

  // iOS Safari では、再生ボタン押下と同時に新規 iframe を生成して autoplay:1 を渡しても
  // 自動再生されないことが多い（新規 iframe 内で YouTube 自身のスクリプトが読み込み完了後に
  // 遅延して play() を呼ぶ形になり、ユーザー操作起点の呼び出しと見なされないため）。そのため
  // 再生対象の動画が決まった時点で、プレーヤーを一時停止（cue）状態で先に生成しておき、
  // ボタン押下時は既存プレーヤーに対して直接 playVideo()/loadVideoById() を呼ぶ
  // （＝クリックハンドラ内で同期的に呼ばれる postMessage 経由のコマンドとして扱われるため、
  // iOS でも再生が許可されやすい）。先に cue しておくだけなので、サムネイル＋再生ボタンの
  // オーバーレイ（!playerStarted の間表示）の裏に隠れており、ユーザーには見えない
  useEffect(() => {
    if (loading || playerStarted || !currentVideo) return;
    if (!playerRef.current) {
      const create = () => {
        if (playerRef.current) return;
        createPlayer(currentVideo, resumeSeconds, false);
      };
      if (window.YT?.Player) {
        create();
      } else {
        loadYouTubeApi().then(create);
      }
      return;
    }
    // 生成済みプレーヤーが cue している動画が、再生開始前に（逆順トグルなどで）変わった場合は
    // 再同期する
    if (playerReadyRef.current && cuedVideoIdRef.current !== currentVideo.youtubeVideoId) {
      playerRef.current.cueVideoById({ videoId: currentVideo.youtubeVideoId, startSeconds: Math.floor(resumeSeconds) });
      cuedVideoIdRef.current = currentVideo.youtubeVideoId;
    }
    // createPlayer は毎レンダーで再生成される関数だが、内部の状態チェック（playerRef.current・
    // cuedVideoIdRef）で冪等になっているため deps に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, playerStarted, currentVideo, resumeSeconds]);

  // シアターモード: ヘッダーを非表示にしてプレーヤーを画面最上部に出す（動画プレーヤー仕様書「シアターモード」）。
  // ページを離れたらリセット（状態は保持しない仕様）
  useEffect(() => {
    setHeaderHidden(theaterMode);
    return () => setHeaderHidden(false);
  }, [theaterMode, setHeaderHidden]);

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
      fetchTagsMap().then((tagsMap) => setTags(resolveTags(p.playlistTagIds ?? [], p.playlistTagsFixed ?? [], tagsMap)));
      // 関連ゲームはページ下部のため、初期表示を待たせず後から反映する
      setGame(null);
      if (p.gameId) {
        fetchGameInfo(p.gameId).then(setGame).catch((err) => console.error(err));
      }

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
        // 注意: 未登録のときにドキュメントを直接 getDoc すると、ルール（isSelf(resource.data.userId)）が
        // 存在しないドキュメントを評価できず一般ユーザーでは permission-denied になる。
        // 本人＋再生リストの等価条件クエリなら、0件でもルールを満たす（管理者はルールを素通りするため気づきにくい）
        const mylistSnap = await getDocs(
          query(collection(db, 'mylist'), where('userId', '==', user.uid), where('playlistId', '==', playlistId), limit(1)),
        );
        const mylistDoc = mylistSnap.docs[0];
        let reverse = false;
        if (mylistDoc) {
          setMylist({ docId: mylistDoc.id, status: normalizeWatchStatus(mylistDoc.data().watchStatus) ?? 'want_to_watch' });
          reverse = mylistDoc.data().isReverseOrder ?? false;
          setReverseOrder(reverse);
        }

        const userSnap = await getDoc(doc(db, 'users', user.uid));
        setContinuousPlay(userSnap.data()?.isContinuousPlayEnabled ?? true);
        setHideUpcomingThumbnails(userSnap.data()?.hideUpcomingThumbnails === true);

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
        let resume: { youtubeVideoId: string; seconds: number } | null = lastProgress
          ? { youtubeVideoId: lastProgress.youtubeVideoId, seconds: lastProgress.lastPlayedSeconds ?? 0 }
          : null;
        // 端末内の控えの方が新しければ（Firestore への最後の書き込みが届かなかった）そちらを使い、Firestore にも書き戻す
        const local = readLocalProgress(user.uid, playlistId);
        const remoteAt: number = lastProgress?.updatedAt?.toMillis?.() ?? 0;
        if (local && local.at > remoteAt) {
          const localVideo = videoList.find((v) => v.youtubeVideoId === local.youtubeVideoId);
          if (localVideo) {
            resume = { youtubeVideoId: local.youtubeVideoId, seconds: local.seconds };
            writeProgressDocs(user.uid, playlistId, localVideo, local.seconds)
              .then((percent) => setWatchHistory((prev) => ({ ...prev, [localVideo.youtubeVideoId]: percent })))
              .catch((err) => console.error(err));
          }
        }
        if (resume) {
          const ordered = reverse ? [...videoList].reverse() : videoList;
          const target = resume;
          const idx = ordered.findIndex((v) => v.youtubeVideoId === target.youtubeVideoId);
          if (idx >= 0) {
            setCurrentIndex(idx);
            setResumeSeconds(target.seconds);
            lastGoodPositionRef.current = target;
          }
        }
      }

      setLoading(false);
    })();
  }, [playlistId, user, authLoading]);

  // スコア・レビュー数・マイリスト数はレビュー投稿（app/api/reviews/upsert）のたびに、タグは
  // タグ編集（app/api/tags/attach・detach）のたびにサーバー側で更新されるため、
  // 操作直後に画面へ反映されるよう購読する
  useEffect(() => {
    if (!playlistId) return;
    return onSnapshot(doc(db, 'playlists', playlistId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setPlaylist((prev) =>
        prev ? { ...prev, score: data.score ?? null, reviewCount: data.reviewCount ?? 0, mylistCount: data.mylistCount ?? 0 } : prev,
      );
      fetchTagsMap().then((tagsMap) => setTags(resolveTags(data.playlistTagIds ?? [], data.playlistTagsFixed ?? [], tagsMap)));
    });
  }, [playlistId]);

  async function recordEpisodeOpened(video: VideoItem, startSeconds: number) {
    lastGoodPositionRef.current = { youtubeVideoId: video.youtubeVideoId, seconds: startSeconds };
    if (!user || !playlistId) return;
    writeLocalProgress(user.uid, playlistId, video.youtubeVideoId, startSeconds);
    lastSavedRef.current = { youtubeVideoId: video.youtubeVideoId, seconds: startSeconds };
    const write = setDoc(doc(db, 'watch_progress', `${user.uid}_${playlistId}_${video.youtubeVideoId}`), {
      userId: user.uid,
      playlistId,
      youtubeVideoId: video.youtubeVideoId,
      lastPlayedSeconds: startSeconds,
      updatedAt: serverTimestamp(),
    });
    openWriteRef.current = write;
    await write;
  }

  async function saveProgress(video: VideoItem, seconds: number) {
    if (!user || !playlistId) return;
    // recordEpisodeOpened の書き込みが先に Firestore に届くよう待ち合わせる（上記コメント参照）
    const last = lastSavedRef.current;
    if (last?.youtubeVideoId === video.youtubeVideoId && last.seconds === seconds) return;
    lastSavedRef.current = { youtubeVideoId: video.youtubeVideoId, seconds };
    // ページを閉じる直前など Firestore への書き込みが終わらない場合に備え、先に端末内へ控えを残す
    writeLocalProgress(user.uid, playlistId, video.youtubeVideoId, seconds);
    await openWriteRef.current?.catch(() => {});
    const percent = await writeProgressDocs(user.uid, playlistId, video, seconds);
    setWatchHistory((prev) => ({ ...prev, [video.youtubeVideoId]: percent }));
  }

  // プレーヤーが正常に動いていると判断できるときだけ、現在の再生位置（秒）を返す。
  // 再生中・一時停止中・バッファ中で、動画の長さが取れていて、対象の動画を読み込んでいること。
  // それ以外（スリープ復帰後のエラー表示中、読み込み直後など）は null
  function readHealthyPosition(): number | null {
    const player = playerRef.current;
    const video = currentVideoRef.current;
    const YT = window.YT;
    if (!player || !video || !playerReadyRef.current || !YT || typeof player.getCurrentTime !== 'function') return null;
    const state = player.getPlayerState?.();
    if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.PAUSED && state !== YT.PlayerState.BUFFERING) return null;
    if (!(player.getDuration?.() > 0)) return null;
    const loadedId = player.getVideoData?.()?.video_id;
    if (loadedId && loadedId !== video.youtubeVideoId) return null;
    const seconds = Math.floor(player.getCurrentTime());
    lastGoodPositionRef.current = { youtubeVideoId: video.youtubeVideoId, seconds };
    return seconds;
  }

  // 現在の動画の再生位置を保存する（一時停止・タブ非表示・ページ離脱・エラー・動画の切り替え直前）。
  // 再生中ならプレーヤーから読み取り、そうでなければ最後に正常に読み取れた位置を使う。
  // 止まっているプレーヤーは不調でも気づけないため、その値では上書きしない
  function flushProgress() {
    const video = currentVideoRef.current;
    if (!video) return;
    const live = playerStateRef.current === window.YT?.PlayerState?.PLAYING ? readHealthyPosition() : null;
    const last = lastGoodPositionRef.current;
    const seconds = live ?? (last?.youtubeVideoId === video.youtubeVideoId ? last.seconds : null);
    if (seconds == null) return;
    saveProgress(video, seconds).catch((err) => console.error(err));
  }
  useEffect(() => {
    flushProgressRef.current = flushProgress;
  });

  // 再生中だけ 5 秒ごとに保存する（一時停止したら止める）
  function startInterval() {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      if (playerStateRef.current !== window.YT?.PlayerState?.PLAYING) return;
      const video = currentVideoRef.current;
      const seconds = readHealthyPosition();
      if (!video || seconds == null) return;
      saveProgress(video, seconds).catch((err) => console.error(err));
    }, 5000);
  }

  function stopInterval() {
    if (!intervalRef.current) return;
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }

  // YT.Player を新規生成する。通常は再生対象が決まった時点で cue（autoplay: false）として
  // 先読み用に呼ばれ、以後の再生操作は既存プレーヤーへのコマンド（playVideo/loadVideoById等）
  // で行う。autoplay: true で呼ぶのは、その先読みが間に合わなかった場合のフォールバックのみ
  // （この経路は iOS Safari では自動再生されないことがあるが、動画自体はロードされるので
  // 手動で再生ボタンを押せば再生できる）
  // 既にプレーヤーがあれば破棄して作り直す（rebuildPlayer 参照）
  function createPlayer(video: VideoItem, startSeconds: number, autoplay: boolean) {
    const host = playerHostRef.current;
    if (!host) return;
    try {
      playerRef.current?.destroy?.();
    } catch (err) {
      console.error(err);
    }
    playerReadyRef.current = false;
    playerStateRef.current = null;
    stopInterval();
    // マウント先の要素は iframe に置き換えられるため、作るたびに新しい要素を用意する
    const mount = document.createElement('div');
    host.replaceChildren(mount);
    const player = new window.YT.Player(mount, {
      // 親（aspect-video の箱）いっぱいのサイズを明示する
      width: '100%',
      height: '100%',
      videoId: video.youtubeVideoId,
      playerVars: { autoplay: autoplay ? 1 : 0, start: Math.floor(startSeconds), playsinline: 1 },
      events: {
        onReady: (e: any) => {
          // 作り直し後に古いプレーヤーから届いたイベントは無視する
          if (playerRef.current !== player) return;
          playerReadyRef.current = true;
          // `?autoplay=1` で開かれた場合は、cue 済みの先読みプレーヤーで再生開始を試みる。
          // ページ内遷移の直後なら PC ブラウザでは概ね許可されるが、iOS Safari などでは
          // ブロックされうる。一定時間 PLAYING にならなければ通常の待機表示に戻す（ミュート再生はしない）
          if (!autoplay && autoStartRequestedRef.current) {
            autoStartRequestedRef.current = false;
            autoStartingRef.current = true;
            setAutoStartPending(true);
            autoStartTimerRef.current = setTimeout(() => setAutoStartPending(false), 4000);
            e.target.seekTo(startSeconds, true);
            e.target.playVideo();
          }
        },
        onStateChange: (e: any) => {
          if (playerRef.current !== player) return;
          const YT = window.YT;
          debugLog(`state=${e.data}`);
          playerStateRef.current = e.data;
          const autoAdvance = autoAdvanceRef.current;
          if (autoAdvance) {
            if (Date.now() > autoAdvance.deadline || autoAdvance.retries <= 0) {
              autoAdvanceRef.current = null;
            } else if (
              e.data === YT.PlayerState.UNSTARTED ||
              e.data === YT.PlayerState.CUED ||
              (e.data === YT.PlayerState.PAUSED && e.target.getCurrentTime() < 1)
            ) {
              autoAdvance.retries -= 1;
              debugLog(`retry play (残り${autoAdvance.retries})`);
              // 全画面の切り替え処理などと重なって再び止められないよう、少し間を置いて再生する。
              // 待つ間にユーザーが別の動画へ移った（autoAdvanceRef が差し替わった）場合は何もしない
              const target = e.target;
              if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
              autoAdvanceTimerRef.current = setTimeout(() => {
                if (autoAdvanceRef.current === autoAdvance) target.playVideo();
              }, 300);
            }
          }
          if (e.data === YT.PlayerState.PLAYING) {
            setIsPlaying(true);
            setPlayerError(false);
            startInterval();
            if (autoStartingRef.current) {
              // 自動再生が成功した: ボタン押下時（handleStart）と同じく開始済みとして扱う
              autoStartingRef.current = false;
              if (autoStartTimerRef.current) clearTimeout(autoStartTimerRef.current);
              setAutoStartPending(false);
              setPlayerStarted(true);
              const video = currentVideoRef.current;
              if (video) recordEpisodeOpened(video, Math.floor(e.target.getCurrentTime())).catch((err) => console.error(err));
            }
          }
          if (e.data !== YT.PlayerState.PLAYING && e.data !== YT.PlayerState.BUFFERING) stopInterval();
          if (e.data === YT.PlayerState.PAUSED) {
            setIsPlaying(false);
            // 一時停止した位置を保存する（以後、再生を再開するまで定期保存はしない）
            const video = currentVideoRef.current;
            const seconds = readHealthyPosition();
            if (video && seconds != null) saveProgress(video, seconds).catch((err) => console.error(err));
          }
          if (e.data === YT.PlayerState.ENDED) {
            setIsPlaying(false);
            const ended = currentVideoRef.current;
            if (ended?.durationSeconds) {
              lastGoodPositionRef.current = { youtubeVideoId: ended.youtubeVideoId, seconds: ended.durationSeconds };
              saveProgress(ended, ended.durationSeconds).catch((err) => console.error(err));
            }
            debugLog(`ENDED continuous=${continuousPlayRef.current}`);
            // 生成時点の古い関数ではなく最新のものを呼ぶ（handleEndedRef 参照）
            handleEndedRef.current();
          }
        },
        // プレーヤーのエラー（動画プレーヤー仕様書「プレーヤーの不調からの復帰」）。最後に正常に読み取れた位置を
        // 保存したうえで、その位置で一時停止状態のプレーヤーを作り直す。作り直しても続けてエラーになる場合は
        // 作り直しを繰り返さず、ページの再読み込みを案内する
        onError: (e: any) => {
          if (playerRef.current !== player) return;
          debugLog(`error=${e.data}`);
          setIsPlaying(false);
          stopInterval();
          flushProgressRef.current();
          if (Date.now() - lastErrorRebuildAtRef.current < AUTO_REBUILD_COOLDOWN_MS) {
            setPlayerError(true);
            return;
          }
          lastErrorRebuildAtRef.current = Date.now();
          rebuildPlayerRef.current();
        },
      },
    });
    playerRef.current = player;
    cuedVideoIdRef.current = video.youtubeVideoId;
  }

  // 現在の動画を、保存済みの位置で一時停止（cue）状態のプレーヤーとして作り直す。
  // 再生開始前（サムネイル表示中）なら「続きから再生する」の位置、開始後なら最後に正常に読み取れた位置
  function rebuildPlayer() {
    const video = currentVideoRef.current;
    if (!video || !window.YT?.Player) return;
    const last = lastGoodPositionRef.current;
    const seconds = last?.youtubeVideoId === video.youtubeVideoId ? last.seconds : resumeSeconds;
    debugLog(`rebuild at ${seconds}`);
    autoAdvanceRef.current = null;
    setIsPlaying(false);
    setResumeSeconds(seconds);
    createPlayer(video, seconds, false);
  }
  useEffect(() => {
    rebuildPlayerRef.current = rebuildPlayer;
  });

  // スリープ・長時間のタブ非表示からの復帰を検知したら、再生中でなければプレーヤーを作り直す。
  // タブを隠したときとページを閉じるときは、その時点の再生位置を保存する
  useEffect(() => {
    let lastTick = Date.now();
    let hiddenAt: number | null = null;
    const onWake = (gap: number) => {
      debugLog(`wake gap=${Math.round(gap / 1000)}s`);
      // タイマーと visibilitychange の両方で検知しても作り直しは1回にする
      lastTick = Date.now();
      hiddenAt = null;
      if (!playerRef.current) return;
      if (playerStateRef.current === window.YT?.PlayerState?.PLAYING) return;
      rebuildPlayerRef.current();
    };
    // スリープ中はタイマーが止まるため、次に動いたときの時刻の飛びで復帰を検知する
    const timer = setInterval(() => {
      const now = Date.now();
      const gap = now - lastTick;
      lastTick = now;
      if (gap > STALE_PLAYER_GAP_MS) onWake(gap);
    }, WAKE_CHECK_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        flushProgressRef.current();
        return;
      }
      const gap = hiddenAt != null ? Date.now() - hiddenAt : 0;
      hiddenAt = null;
      lastTick = Date.now();
      if (gap > STALE_PLAYER_GAP_MS) onWake(gap);
    };
    const onPageHide = () => flushProgressRef.current();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  function handleStart() {
    // 自動再生の試行中（または試行前）にユーザーが押した場合は、こちらの経路で開始済みとする
    autoStartRequestedRef.current = false;
    autoStartingRef.current = false;
    if (autoStartTimerRef.current) clearTimeout(autoStartTimerRef.current);
    setAutoStartPending(false);
    setPlayerStarted(true);
    const video = orderedVideos[currentIndex];
    if (!video) return;
    // 進捗記録は待たない（Firestore への往復で iOS Safari の自動再生許可が失効するため）
    recordEpisodeOpened(video, resumeSeconds).catch((err) => console.error(err));
    const player = playerRef.current;
    if (player && playerReadyRef.current) {
      // 先読みで cue 済みのプレーヤーに対して直接コマンドを送る（クリックハンドラ内で同期的に
      // 呼ぶことで、iOS Safari でもユーザー操作起点の再生として扱われる）
      if (cuedVideoIdRef.current === video.youtubeVideoId) {
        player.seekTo(resumeSeconds, true);
        player.playVideo();
      } else {
        player.loadVideoById({ videoId: video.youtubeVideoId, startSeconds: resumeSeconds });
        cuedVideoIdRef.current = video.youtubeVideoId;
      }
    } else {
      // 先読みがまだ間に合っていない場合のフォールバック
      createPlayer(video, resumeSeconds, true);
    }
  }

  function goToRelative(delta: number, auto: boolean) {
    const nextIndex = currentIndex + delta;
    const nextVideo = orderedVideos[nextIndex];
    if (!nextVideo) return;
    // 切り替える前の動画の位置を確定させる
    flushProgress();
    setCurrentIndex(nextIndex);
    setResumeSeconds(0);
    recordEpisodeOpened(nextVideo, 0).catch((err) => console.error(err));
    const player = playerRef.current;
    autoAdvanceRef.current = auto ? { deadline: Date.now() + 8000, retries: 3 } : null;
    if (player && playerReadyRef.current) {
      player.loadVideoById({ videoId: nextVideo.youtubeVideoId, startSeconds: 0 });
      cuedVideoIdRef.current = nextVideo.youtubeVideoId;
    } else if (auto) {
      createPlayer(nextVideo, 0, true);
    }
  }
  useEffect(() => {
    goToRelativeRef.current = goToRelative;
  });

  // 動画の再生終了（ENDED）。表示順で最後の動画なら最終話の再生終了時の処理、
  // それ以外は連続再生がONなら次の動画へ進む（動画プレーヤー仕様書「連続再生機能」「最終話の再生終了時」）
  function handleEnded() {
    if (currentIndex === orderedVideos.length - 1) {
      handlePlaylistFinished();
    } else if (continuousPlay) {
      goToRelative(1, true);
    }
  }
  useEffect(() => {
    handleEndedRef.current = handleEnded;
  });

  // 最終話の再生終了時: 全画面を解除し、この再生リストの完走確認・レビューを促すダイアログを出す。
  // 完走済みかつレビュー（星かコメント）済みなら促すことが無いので出さない
  function handlePlaylistFinished() {
    // YouTube の全画面は iframe が全画面要素になっているため、ページ側から解除できる
    // （iOS Safari の動画ネイティブ全画面はページから解除できない。抜けた時点でダイアログが見える）
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (finishedPromptShownRef.current) return;
    if (!user) {
      finishedPromptShownRef.current = true;
      setFinishedLoginOpen(true);
      return;
    }
    const sections: FinishedPromptSections = {
      status: mylist?.status !== 'completed',
      review: ownReview.starRating == null && !ownReview.comment,
    };
    if (!sections.status && !sections.review) return;
    finishedPromptShownRef.current = true;
    setFinishedPrompt(sections);
  }

  function jumpTo(index: number) {
    const video = orderedVideos[index];
    if (!video) return;
    if (playerStarted) flushProgress();
    setCurrentIndex(index);
    setResumeSeconds(0);
    setPlayerStarted(true);
    recordEpisodeOpened(video, 0).catch((err) => console.error(err));
    autoAdvanceRef.current = null;
    const player = playerRef.current;
    if (player && playerReadyRef.current) {
      player.loadVideoById({ videoId: video.youtubeVideoId, startSeconds: 0 });
      cuedVideoIdRef.current = video.youtubeVideoId;
    } else {
      createPlayer(video, 0, true);
    }
  }

  function togglePlayPause() {
    const player = playerRef.current;
    // 作り直し直後で準備ができていない間は何もしない
    if (!player || !playerReadyRef.current) return;
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

  function showOsd(label: string, icon?: ReactNode) {
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    setOsd((prev) => ({ id: (prev?.id ?? 0) + 1, label, icon }));
    osdTimerRef.current = setTimeout(() => setOsd(null), OSD_DURATION_MS);
  }

  // キーボードショートカットの実行（動画プレーヤー仕様書「キーボード操作」）。
  // true を返すと既定動作（ボタンの起動・ページスクロール）を止める。再生開始前は Space/K（開始）と ? だけを扱い、
  // それ以外は false を返して矢印キーのスクロール等をそのまま通す
  function handleShortcut(action: ShortcutAction): boolean {
    if (action.type === 'help') {
      setShortcutHelpOpen(true);
      return true;
    }
    if (!playerStarted) {
      if (action.type !== 'togglePlay') return false;
      handleStart();
      return true;
    }
    if (action.type === 'theater') {
      setTheaterMode((v) => !v);
      return true;
    }
    if (action.type === 'next' || action.type === 'prev') {
      const delta = action.type === 'next' ? 1 : -1;
      if (!orderedVideos[currentIndex + delta]) return true;
      goToRelative(delta, false);
      lastSeekRef.current = null;
      showOsd(action.type === 'next' ? '次の動画' : '前の動画');
      return true;
    }
    const player = playerRef.current;
    if (!player || !playerReadyRef.current) return true;
    switch (action.type) {
      case 'togglePlay':
        togglePlayPause();
        showOsd(isPlaying ? '一時停止' : '再生', isPlaying ? <PauseIcon size={28} /> : <PlayIcon size={28} />);
        break;
      case 'seekBy': {
        const duration = player.getDuration();
        const last = lastSeekRef.current;
        const current = last && Date.now() - last.at < 1000 ? last.value : player.getCurrentTime();
        const raw = Math.max(0, current + action.seconds);
        const target = duration ? Math.min(duration, raw) : raw;
        player.seekTo(target, true);
        lastSeekRef.current = { value: target, at: Date.now() };
        showOsd(`${action.seconds > 0 ? '+' : '−'}${Math.abs(action.seconds)}秒`);
        break;
      }
      case 'seekToFraction': {
        const duration = player.getDuration();
        if (!duration) break;
        player.seekTo(duration * action.fraction, true);
        lastSeekRef.current = { value: duration * action.fraction, at: Date.now() };
        showOsd(action.fraction === 0 ? '先頭' : action.fraction === 1 ? '末尾' : `${Math.round(action.fraction * 100)}%`);
        break;
      }
      case 'volumeBy': {
        const last = lastVolumeRef.current;
        const current = last && Date.now() - last.at < 1000 ? last.value : player.getVolume();
        const volume = Math.min(100, Math.max(0, current + action.delta));
        player.setVolume(volume);
        lastVolumeRef.current = { value: volume, at: Date.now() };
        // YouTube と同じく、ミュート中に音量を変えたらミュートを解除する
        if (player.isMuted()) player.unMute();
        showOsd(`音量 ${volume}%`);
        break;
      }
      case 'toggleMute':
        if (player.isMuted()) {
          player.unMute();
          showOsd(`音量 ${player.getVolume()}%`);
        } else {
          player.mute();
          showOsd('ミュート');
        }
        break;
      case 'fullscreen': {
        // keydown はユーザー操作として扱われるため、ここから全画面を要求できる（iOS Safari 等で未対応なら何もしない）
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          const iframe: HTMLIFrameElement | undefined = player.getIframe?.();
          iframe?.requestFullscreen?.().catch(() => {});
        }
        break;
      }
    }
    return true;
  }
  usePlayerShortcuts({ enabled: !loading, onKey: handleShortcut });

  useEffect(() => {
    return () => {
      // ページ内の遷移で離れるときも、その時点の位置を保存する
      flushProgressRef.current();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (autoStartTimerRef.current) clearTimeout(autoStartTimerRef.current);
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
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
      {/* シアターモード: プレーヤーの表示面積を最優先し、高さが「ビューポート − 上余白16px(pt-4)」を
          超えない幅まで縮める（横持ちスマホでは高さいっぱい・左右に黒帯）。コントローラ行の高さは
          あえて差し引かず、画面に収まらなければ下スクロールで表示する。
          dvh ではなく lvh（ツールバー縮小時の高さで固定）を使う: dvh は iOS Safari でツールバーの出入りに
          追従して値が変わり、スクロールのたびにプレーヤーが伸縮して下のブロックががくつくため。
          svh（ツールバー表示時の高さ）は横持ちでツールバーが高く、プレーヤーが小さくなりすぎるため不採用。
          16px は下の w-[...] と max-h-[...] の2箇所に直書き。Tailwind の任意値クラスは静的にソースを
          読んでCSSを生成するため、JSの変数やテンプレートリテラルで値を差し込むとクラスが生成されなくなる。
          値を変える際はこの2箇所を手動で合わせること */}
      <div
        className={cn(
          'relative aspect-video overflow-hidden bg-bg-player',
          theaterMode ? 'mx-auto w-[min(100%,calc((100lvh-16px)*16/9))] max-h-[calc(100lvh-16px)]' : 'w-full rounded-[12px] shadow-card',
        )}
      >
        {/* プレーヤーのマウント先は常に置いておき、開始前はサムネイルを重ねる */}
        <div ref={playerHostRef} className="absolute inset-0 size-full" />
        {!playerStarted && (
          <button
            type="button"
            onClick={handleStart}
            aria-label={autoStartPending ? '再生を準備中' : resumeSeconds > 0 ? '続きから再生する' : '再生する'}
            className="group absolute inset-0 flex items-center justify-center bg-bg-player"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentVideo?.thumbnailUrl || playlist.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-[46%] bg-thumb-overlay" />
            {/* 再生ボタン（トークン仕様書 v2.0 §6.5）。ヒーローは大きめの 64px */}
            <span className="relative inline-flex size-16 items-center justify-center rounded-full bg-gradient-primary text-white shadow-primary transition-transform duration-[120ms] group-hover:scale-105">
              {autoStartPending ? <Spinner size={24} label="再生を準備中" className="text-white" /> : <PlayIcon size={30} />}
            </span>
          </button>
        )}
        {osd && <PlayerOsd key={osd.id} icon={osd.icon} text={osd.icon ? undefined : osd.label} />}
        <span className="sr-only" aria-live="polite">
          {osd?.label}
        </span>
      </div>

      <div className={cn('mt-3 flex flex-col gap-3', theaterMode && 'pb-4')}>
        {/* 再生中の動画タイトル（動画プレーヤー仕様書「再生中の動画タイトル」）。再生リスト名は基本情報カードに
            あるため、ここでは動画タイトルだけを最大2行で出す（タイトルに無い文字列を足さない） */}
        {currentVideo && (
          <p className="line-clamp-2 text-md leading-snug text-text-primary" title={currentVideo.title}>
            {currentVideo.title}
          </p>
        )}
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
        {playerError && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[8px] border border-border-card bg-bg-card p-3 text-md text-text-primary">
            <span className="flex-1">
              プレーヤーを読み込めませんでした。ページを再読み込みしてください（再生位置は保存されています）。
            </span>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              ページを再読み込み
            </Button>
          </div>
        )}
        {debugLines.length > 0 && (
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-black p-2 text-xs text-green-400">
            {'state: -1=未開始 0=終了 1=再生中 2=一時停止 3=バッファ中 5=cue\n' + debugLines.join('\n')}
          </pre>
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
      tags={tags}
      onEditTags={user ? () => setTagModalOpen(true) : undefined}
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
      referenceUrl={playlist.referenceUrl}
      hiddenThumbnailIds={user && hideUpcomingThumbnails ? upcomingVideoIds(videos, currentVideo, watchHistory) : undefined}
    />
  );

  const channelCard = <ChannelCard channelId={playlist.channelId} name={playlist.channelName} iconUrl={playlist.channelIconUrl} />;
  const reviewSection = (
    <ReviewSection playlistId={playlistId} user={user} mylist={mylist} onMylistChange={setMylist} writeRequest={reviewWriteRequest} />
  );

  // 通常モード: PC 2カラム（左 62% / 右 38%: ヒーロー・レビュー | 基本情報・配信者・動画リスト・ゲーム）、
  //             モバイルは ヒーロー→基本情報→配信者→動画リスト→レビュー→ゲーム の縦積み
  // （ページ 再生リスト詳細 仕様書「レビュー投稿セクション」節: PC版は左カラム、モバイル版は
  //   動画リスト直後という配置差があるため、reviewSection は下記の2箇所に描画し
  //   CSSで片方を隠す。PlaylistInfoCardと同じパターン）
  // シアターモード: ヒーローを全幅・黒背景で最上部に、その下に 基本情報 | 配信者・動画リスト・ゲーム の2カラム
  // （いずれも DOM 順は同じで、クラスの切替のみ）
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[62fr_38fr]">
      <div className={cn('flex min-w-0 flex-col gap-4', theaterMode && 'md:col-span-2')}>
        {hero}
        <div className="md:hidden">{infoCard}</div>
        <div className="hidden md:block">{reviewSection}</div>
      </div>
      <div
        className={cn(
          'flex min-w-0 flex-col gap-4',
          theaterMode && 'md:col-span-2 md:grid md:grid-cols-[62fr_38fr] md:items-start md:gap-6',
        )}
      >
        <div className="hidden min-w-0 md:block">{infoCard}</div>
        <div className="flex min-w-0 flex-col gap-4">
          {channelCard}
          {videoList}
          <div className="md:hidden">{reviewSection}</div>
          {game && <GameInfoCard {...game} />}
          {/* この再生リストを含む公開まとめ（まとめ機能仕様書 §7）。0件なら何も描画しない */}
          <ContainingCollectionsCard playlistId={playlistId} />
        </div>
      </div>

      <TagEditModal open={tagModalOpen} onOpenChange={setTagModalOpen} targetType="playlist" targetId={playlistId} tags={tags} />
      <PlayerShortcutsModal open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen} />
      <PlaylistFinishedModal
        sections={finishedPrompt}
        onClose={() => setFinishedPrompt(null)}
        playlistId={playlistId}
        user={user}
        mylist={mylist}
        onMylistChange={setMylist}
        review={ownReview}
        onRequestWriteReview={() => setReviewWriteRequest((n) => n + 1)}
      />
      <LoginRequiredModal
        open={finishedLoginOpen}
        onOpenChange={setFinishedLoginOpen}
        title="ログインすると、完走の記録やレビューができます"
      />
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
            {Array.from({ length: 3 }).map((_, i) => (
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
