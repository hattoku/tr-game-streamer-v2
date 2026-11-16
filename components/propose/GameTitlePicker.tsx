'use client';

/**
 * 提案ページのゲームタイトル欄（ページ 提案する 仕様書 §5.4。選び方は ページ 再生リストを追加する 仕様書 §4.2・§9.2 のまま）。
 * - 任意。`initialGameId`（巡回で推定したゲーム・ゲーム詳細から来たときのゲーム）を選んだ状態で始まり、変更も空欄もできる
 * - 一般ユーザーは候補に無いゲームを「新しいゲームタイトルとして入力する」・楽天ブックスの候補から選べる（新しいゲームタイトルの提案）
 * - 管理者はモーダルのフッターからゲームタイトルを新規登録できる（GameCreateModal）
 * 選んだ内容は `onChange` で親に渡す。選ぶ再生リストが変わったときは親が `key` を変えて作り直す。
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, INPUT_CLASS, Input, Textarea } from '@/components/ui/Input';
import { ChevronDownIcon, XIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { MultiSelectMenu } from '@/components/ui/DropdownMenu';
import { GameSelectModal, type GameOption } from '@/components/playlists/GameSelectModal';
import { GameCreateModal } from '@/components/games/GameCreateModal';
import { MAX_GAME_PROPOSAL_NOTE_LENGTH, MAX_GAME_TITLE_LENGTH, type ProposalRakutenItem } from '@/lib/proposal-shared';
import { PLATFORM_OPTIONS, findSimilarGames } from '@/lib/game-shared';
import { normalizeRakutenGameTitle } from '@/lib/rakuten-shared';

/** 一般ユーザーが新しいゲームタイトルとして入力している内容（§4.2.2・§9.2）。rakuten は楽天ブックスの候補から選んだ場合の商品 */
export interface NewGameInput {
  title: string;
  note: string;
  platforms: string[];
  rakuten: ProposalRakutenItem | null;
}

/** 親に渡す選択の内容。`ready` が false なら送信できない（新しいゲームタイトルの入力が途中・長すぎる） */
export type GameChoice =
  | { kind: 'none'; ready: true }
  | { kind: 'existing'; game: GameOption; ready: true }
  | { kind: 'new'; input: NewGameInput; ready: boolean };

const PLATFORM_SELECT_OPTIONS = PLATFORM_OPTIONS.map((p) => ({ value: p, label: p }));

export function GameTitlePicker({
  games,
  onGameCreated,
  isAdmin,
  initialGameId,
  disabled,
  titleError,
  onTitleErrorChange,
  onChange,
}: {
  games: GameOption[];
  onGameCreated: (game: GameOption) => void;
  isAdmin: boolean;
  initialGameId: string | null;
  disabled: boolean;
  /** 送信時に返ってきた新しいゲームタイトルのエラー（同名が登録済みなど） */
  titleError: string | null;
  onTitleErrorChange: (error: string | null) => void;
  onChange: (choice: GameChoice) => void;
}) {
  const [selectedGame, setSelectedGame] = useState<GameOption | null>(null);
  const [newGame, setNewGame] = useState<NewGameInput | null>(null);
  const [gameModalOpen, setGameModalOpen] = useState(false);
  const [gameCreateModalOpen, setGameCreateModalOpen] = useState(false);

  // 初期値（推定したゲーム・ゲーム詳細からのゲーム）は、ゲームタイトルの一覧（非同期取得）が揃った時点で一度だけ選ぶ。
  // 「propが変わったらstateを調整する」パターンのため、effectではなく描画中に直接setStateする
  const [appliedInitial, setAppliedInitial] = useState(false);
  if (!appliedInitial && initialGameId && games.length > 0) {
    setAppliedInitial(true);
    const match = games.find((g) => g.id === initialGameId);
    if (match) setSelectedGame(match);
  }

  const newGameTitle = newGame?.title.trim() ?? '';
  const newGameReady =
    !!newGame && !!newGameTitle && newGameTitle.length <= MAX_GAME_TITLE_LENGTH && newGame.note.trim().length <= MAX_GAME_PROPOSAL_NOTE_LENGTH;

  useEffect(() => {
    if (newGame && !isAdmin) onChange({ kind: 'new', input: newGame, ready: newGameReady });
    else if (selectedGame) onChange({ kind: 'existing', game: selectedGame, ready: true });
    else onChange({ kind: 'none', ready: true });
    // onChange は親の setState を想定（描画ごとに作り直されても同じ働き）のため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGame, newGame, newGameReady, isAdmin]);

  // 新しいゲームタイトル名に似た登録済みゲームタイトル（§9.2）
  const similarGames = newGame && !isAdmin ? findSimilarGames(newGameTitle, games) : [];

  function pickExisting(game: GameOption) {
    setSelectedGame(game);
    setNewGame(null);
    onTitleErrorChange(null);
  }

  return (
    <>
      {newGame && !isAdmin ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-md text-text-tertiary">ゲームタイトル（新しいゲームタイトルとして提案します）</p>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setGameModalOpen(true)} disabled={disabled}>
                一覧から選び直す
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNewGame(null);
                  onTitleErrorChange(null);
                }}
                disabled={disabled}
              >
                空欄に戻す
              </Button>
            </div>
          </div>
          {/* 楽天ブックスの候補から選んだ商品（§9.2）。審査時の登録に使う。外すと自由入力として送る */}
          {newGame.rakuten && (
            <div className="flex items-center gap-3 rounded-[8px] border border-border-card bg-bg-input p-2">
              {newGame.rakuten.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={newGame.rakuten.imageUrl} alt="" className="h-[64px] w-[48px] shrink-0 rounded-[4px] object-cover" />
              ) : (
                <div className="h-[64px] w-[48px] shrink-0 rounded-[4px] bg-bg-btn" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-text-tertiary">楽天ブックスの商品</p>
                <p className="line-clamp-2 text-sm text-text-primary">{newGame.rakuten.title}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setNewGame({ ...newGame, rakuten: null })} disabled={disabled}>
                外す
              </Button>
            </div>
          )}
          <Field
            label={`ゲームタイトル名 *（${newGameTitle.length}/${MAX_GAME_TITLE_LENGTH}）`}
            error={titleError ?? (newGameTitle.length > MAX_GAME_TITLE_LENGTH ? `${MAX_GAME_TITLE_LENGTH}文字以内で入力してください` : null)}
          >
            {(props) => (
              <Input
                {...props}
                value={newGame.title}
                onChange={(e) => {
                  setNewGame({ ...newGame, title: e.target.value });
                  onTitleErrorChange(null);
                }}
                onBlur={() => {
                  if (!newGame.title.trim()) onTitleErrorChange('ゲームタイトル名を入力してください');
                }}
                disabled={disabled}
              />
            )}
          </Field>
          {/* 似た名前の登録済みゲームタイトル（§9.2）。押すとそのゲームタイトルを選んだ状態に切り替える */}
          {similarGames.length > 0 && (
            <div className="flex flex-col gap-2 rounded-[8px] bg-bg-child px-3 py-2">
              <p className="text-md text-text-secondary">登録済みのこちらではありませんか？</p>
              <div className="flex flex-wrap gap-2">
                {similarGames.map((g) => (
                  <Button key={g.id} variant="secondary" size="sm" onClick={() => pickExisting(g)} disabled={disabled}>
                    {g.title}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-md text-text-tertiary">機種（任意・複数選択可）</p>
            <MultiSelectMenu
              values={new Set(newGame.platforms)}
              onToggle={(p) =>
                setNewGame({
                  ...newGame,
                  platforms: newGame.platforms.includes(p) ? newGame.platforms.filter((x) => x !== p) : [...newGame.platforms, p],
                })
              }
              options={PLATFORM_SELECT_OPTIONS}
              placeholder={newGame.platforms.length > 0 ? newGame.platforms.join('、') : '分かれば選んでください'}
              filterPlaceholder="機種名で絞り込み"
              aria-label="機種"
              disabled={disabled}
            />
          </div>
          <Field
            label={`備考（${newGame.note.trim().length}/${MAX_GAME_PROPOSAL_NOTE_LENGTH}）`}
            hint="シリーズ情報など補足があれば記入してください"
            error={newGame.note.trim().length > MAX_GAME_PROPOSAL_NOTE_LENGTH ? `${MAX_GAME_PROPOSAL_NOTE_LENGTH}文字以内で入力してください` : null}
          >
            {(props) => (
              <Textarea {...props} value={newGame.note} onChange={(e) => setNewGame({ ...newGame, note: e.target.value })} disabled={disabled} rows={2} />
            )}
          </Field>
        </div>
      ) : (
        <Field label="ゲームタイトル（任意）" hint="ゲームが分からない場合は空欄のままで大丈夫です">
          {(props) => (
            <div className="flex items-center gap-2">
              <button
                type="button"
                id={props.id}
                aria-describedby={props['aria-describedby']}
                aria-haspopup="dialog"
                onClick={() => setGameModalOpen(true)}
                disabled={disabled}
                className={cn(INPUT_CLASS, 'flex items-center justify-between gap-2 text-left', !selectedGame && 'text-input-placeholder')}
                data-testid="game-title-select"
              >
                <span className="truncate">{selectedGame ? selectedGame.title : 'ゲームタイトルを選択する'}</span>
                <ChevronDownIcon size={16} className="shrink-0 text-text-muted" />
              </button>
              {selectedGame && (
                <Button variant="ghost" size="sm" aria-label="ゲームタイトルの選択を解除" onClick={() => setSelectedGame(null)} disabled={disabled}>
                  <XIcon size={16} />
                </Button>
              )}
            </div>
          )}
        </Field>
      )}

      <GameSelectModal
        open={gameModalOpen}
        onOpenChange={setGameModalOpen}
        games={games}
        onSelect={pickExisting}
        onAddNew={isAdmin ? () => setGameCreateModalOpen(true) : undefined}
        onEnterNew={
          isAdmin
            ? undefined
            : (query) => {
                setSelectedGame(null);
                onTitleErrorChange(null);
                // 検索欄が空なら入力中の内容を残す。検索語で入れ直した場合、前に選んだ楽天の商品は外す
                setNewGame((prev) =>
                  query
                    ? { title: query, note: prev?.note ?? '', platforms: prev?.platforms ?? [], rakuten: null }
                    : (prev ?? { title: '', note: '', platforms: [], rakuten: null }),
                );
              }
        }
        onPickRakuten={
          isAdmin
            ? undefined
            : (item) => {
                // 楽天ブックスの候補（§9.2）: 版・機種の表記を削った名前と、その商品の機種を入れた新しいゲームタイトルにする
                setSelectedGame(null);
                onTitleErrorChange(null);
                const hardware = item.hardware.trim();
                setNewGame((prev) => ({
                  title: normalizeRakutenGameTitle(item.title).slice(0, MAX_GAME_TITLE_LENGTH),
                  note: prev?.note ?? '',
                  platforms: PLATFORM_OPTIONS.includes(hardware) ? [hardware] : [],
                  rakuten: { itemUrl: item.itemUrl, title: item.title, imageUrl: item.imageUrl, hardware, booksGenreId: item.booksGenreId },
                }));
              }
        }
      />
      {isAdmin && (
        <GameCreateModal
          open={gameCreateModalOpen}
          onOpenChange={setGameCreateModalOpen}
          onCreated={(game) => {
            onGameCreated(game);
            setSelectedGame(game);
          }}
        />
      )}
    </>
  );
}

/** 送信用に、選択の内容を API の項目へ直す */
export function gameChoicePayload(choice: GameChoice): Record<string, unknown> {
  if (choice.kind === 'existing') return { gameId: choice.game.id };
  if (choice.kind === 'new') {
    return {
      newGameTitle: choice.input.title.trim(),
      newGameNote: choice.input.note.trim(),
      newGamePlatforms: choice.input.platforms,
      newGameRakuten: choice.input.rakuten,
    };
  }
  return {};
}
