/**
 * ゲームタイトル新規登録モーダル（管理者専用、フェーズ4.5ステップ2）。
 * GameSelectModalのフッター「見つからない場合」導線から開く。一般ユーザー向けの
 * 「登録を提案する」モーダル（ページ 再生リストを追加する 仕様書 §4.2.2）とは別物で、
 * 審査を経ずその場で`games`に直接書き込む（同仕様書 §4.2.2 末尾の対象ユーザー注記のとおり、
 * 管理者はマスタ管理相当の直接登録ができるため提案フローの対象外）。
 *
 * フォームの先頭は楽天ブックスのタイトル名検索欄（2026-09-22、フェーズ5のユーザー要望で商品ページURL欄と
 * 入れ替え）。検索して候補を選ぶと、商品情報からゲームタイトル名（未入力時のみ）・ジャンル（未選択時のみ）・
 * テーマ・プラットフォーム・パッケージ画像URLを分かる範囲で自動セットする（handleSelectRakuten→
 * applyRakutenItem参照。ジャンル/テーマは楽天のカテゴリ名とマスタ名の一致で照合、機種は
 * PLATFORM_OPTIONSと一致したもののみ）。検索で見つからない、または商品ページURLが分かっているときは、
 * 検索欄の次にある楽天ブックス商品ページURL欄（`/api/admin/games/rakuten-item`）でも同じ自動セットが
 * できる。どちらの結果も共通のプレビュー（RakutenItemPreview）に表示する。検索キーワード欄はゲーム
 * タイトル名欄と連動しない独立した自由入力（2026-09-22のフォーム再構成前はタイトル入力に自動追従して
 * いたが、検索が主導線になったため廃止）。楽天に無いタイトル向けに、パッケージ画像URLの直接入力欄を
 * プラットフォーム欄の下に独立して残している。
 * テーマ・プラットフォームは候補が多い（テーマ50件超・機種18件）ため、複数選択プルダウン＋
 * 選択済みチップの表示にしてフォームをコンパクトに保つ。
 *
 * `initial` を渡すと同じフォームが編集モードになる（ゲームタイトル詳細ページの管理者向け
 * 「ゲームタイトル情報を編集する」ボタンから。ページ ゲームタイトル 詳細 仕様書 §3.3・第7章の暫定版。
 * 2026-09-21）。編集時は `PATCH /api/admin/games/{id}` に保存し、説明文があるときだけ
 * 「AIによる生成」バッジ表示のON/OFF（同仕様書 §7.2）も切り替えられる。
 */
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { MultiSelectMenu, SelectMenu } from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/Toast';
import { CheckIcon, SearchIcon } from '@/components/ui/icons';
import type { GameOption } from '@/components/playlists/GameSelectModal';
import type { RakutenGameItem, RakutenGameSearchResult, RakutenGenreInfo } from '@/lib/rakuten';
import { normalizeRakutenBooksItemUrl, normalizeRakutenGameTitle, toMasterThemeName } from '@/lib/rakuten-shared';

// 楽天ブックスのゲーム機種一覧（表記も楽天の`hardware`値に合わせ、商品情報からの自動セットが
// そのまま照合できるようにする）＋テストデータで実績のあるSteam。メーカー別に並べて探しやすくする。
// 自由入力ではなく固定候補にして手入力表記のブレを防ぐ（2026-09-22、5機種から拡充）
const PLATFORM_OPTIONS = [
  'Nintendo Switch',
  'Nintendo Switch 2',
  'Wii U',
  'Wii',
  'ニンテンドー3DS',
  'ニンテンドーDS',
  'PS5',
  'PS4',
  'PS3',
  'PS2',
  'PS Vita',
  'PSP',
  'Xbox Series X',
  'Xbox One',
  'Xbox 360',
  'Steam',
  'おもちゃ',
  'その他',
];
const PLATFORM_SELECT_OPTIONS = PLATFORM_OPTIONS.map((p) => ({ value: p, label: p }));

interface MasterOption {
  id: string;
  name: string;
}

/** 編集モードの初期値（games ドキュメントの該当フィールド） */
export interface GameFormInitial {
  id: string;
  title: string;
  genreId: string | null;
  themeIds: string[];
  platforms: string[];
  packageImageUrl: string | null;
  rakutenUrl: string | null;
  description: string | null;
  isAiGeneratedDescription: boolean;
}

interface GameCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 指定すると編集モード（PATCH）。省略時は新規登録（POST） */
  initial?: GameFormInitial;
  /** 新規登録が成功したとき */
  onCreated?: (game: GameOption) => void;
  /** 編集の保存が成功したとき */
  onUpdated?: () => void;
}

// ジャンル・テーマの候補順: 五十音順だが「その他」だけは受け皿として末尾に置く
// （五十音順のままだと一覧の途中に紛れて探しにくい。2026-09-22ユーザー指摘）
function compareMasterOption(a: MasterOption, b: MasterOption): number {
  const aOther = a.name === 'その他';
  const bOther = b.name === 'その他';
  if (aOther !== bOther) return aOther ? 1 : -1;
  return a.name.localeCompare(b.name, 'ja');
}

async function getIdToken(): Promise<string> {
  if (!auth.currentUser) throw new Error('not signed in');
  return auth.currentUser.getIdToken();
}

export function GameCreateModal({ open, onOpenChange, initial, onCreated, onUpdated }: GameCreateModalProps) {
  const { toast } = useToast();
  const isEdit = !!initial;

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
  const [isAiGeneratedDescription, setIsAiGeneratedDescription] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 楽天ブックス商品ページURLからの取得状態（検索欄の次に置く欄）
  const [rakutenItemFetching, setRakutenItemFetching] = useState(false);
  const [rakutenItemError, setRakutenItemError] = useState<string | null>(null);
  // 商品ページURLの取得、またはタイトル検索での候補選択の結果（プレビュー表示用）
  const [selectedRakuten, setSelectedRakuten] = useState<{ title: string; imageUrl: string } | null>(null);

  // フォーム先頭: 楽天ブックスのタイトル名検索（検索して候補を選ぶとタイトル名・ジャンル等を自動セット）
  const [rakutenQuery, setRakutenQuery] = useState('');
  const [rakutenSearching, setRakutenSearching] = useState(false);
  const [rakutenSearched, setRakutenSearched] = useState(false);
  const [rakutenError, setRakutenError] = useState<string | null>(null);
  const [rakutenResults, setRakutenResults] = useState<RakutenGameSearchResult[]>([]);

  // モーダルを開くたびにフォームをリセットする（TagEditModalと同じ
  // 「propが変わったらstateを調整する」パターン。effect内のsetStateより1テンポ早い）。
  // 編集モードでは initial の値で初期化する（楽天URL・画像URLも各欄にそのまま見える）
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle(initial?.title ?? '');
      setTitleError(null);
      setGenreId(initial?.genreId ?? '');
      setThemeIds(new Set(initial?.themeIds ?? []));
      setPlatforms(new Set(initial?.platforms ?? []));
      setPackageImageUrl(initial?.packageImageUrl ?? '');
      setRakutenUrl(initial?.rakutenUrl ?? '');
      setDescription(initial?.description ?? '');
      setIsAiGeneratedDescription(initial?.isAiGeneratedDescription ?? false);
      // 検索欄はタイトル欄と連動しないため、編集モードでも毎回空欄で開く
      setRakutenQuery('');
      setRakutenSearching(false);
      setRakutenSearched(false);
      setRakutenError(null);
      setRakutenResults([]);
      setSelectedRakuten(null);
      setRakutenItemFetching(false);
      setRakutenItemError(null);
    }
  }

  useEffect(() => {
    if (!open || genres.length > 0) return;
    Promise.all([getDocs(collection(db, 'genres')), getDocs(collection(db, 'themes'))])
      .then(([genresSnap, themesSnap]) => {
        setGenres(genresSnap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? '' })).sort(compareMasterOption));
        setThemes(themesSnap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? '' })).sort(compareMasterOption));
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

  async function handleRakutenSearch() {
    const q = rakutenQuery.trim();
    if (!q) return;
    setRakutenSearching(true);
    setRakutenError(null);
    setRakutenResults([]);
    setSelectedRakuten(null);
    try {
      const idToken = await getIdToken();
      const res = await fetch(`/api/admin/games/rakuten-search?title=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = await res.json();
      if (!res.ok) {
        setRakutenError('検索に失敗しました。時間をおいて再試行するか、楽天ブックス商品ページURLを貼って取得してください');
        return;
      }
      setRakutenResults(body.results ?? []);
    } catch {
      setRakutenError('通信エラーが発生しました');
    } finally {
      setRakutenSearching(false);
      setRakutenSearched(true);
    }
  }

  // 楽天の商品情報をフォームに反映する（商品ページURLの取得・タイトル検索の候補選択で共通）。
  // 管理者が既に入力・選択した値は上書きしない（タイトル・ジャンルは空のときだけ、テーマ・機種は追加のみ）
  function applyRakutenItem(result: RakutenGameSearchResult, genre: RakutenGenreInfo | null) {
    setSelectedRakuten({ title: result.title, imageUrl: result.imageUrl });
    setPackageImageUrl(result.imageUrl);
    setRakutenUrl(result.itemUrl);
    setRakutenItemError(null);

    const normalizedTitle = normalizeRakutenGameTitle(result.title);
    if (!title.trim() && normalizedTitle) {
      setTitle(normalizedTitle);
      setTitleError(null);
    }
    const hardware = result.hardware.trim();
    if (PLATFORM_OPTIONS.includes(hardware)) {
      setPlatforms((prev) => new Set(prev).add(hardware));
    }
    applyRakutenGenre(genre);
  }

  function applyRakutenGenre(genre: RakutenGenreInfo | null) {
    if (!genre) return;
    const matchedGenre = genres.find((g) => g.name === genre.genreName);
    if (matchedGenre && !genreId) setGenreId(matchedGenre.id);
    const matchedTheme = genre.themeName ? themes.find((t) => t.name === toMasterThemeName(genre.themeName)) : undefined;
    if (matchedTheme) setThemeIds((prev) => new Set(prev).add(matchedTheme.id));
  }

  async function handleSelectRakuten(result: RakutenGameSearchResult) {
    setRakutenResults([]);
    applyRakutenItem(result, null);
    // ジャンル/テーマは検索結果に含まれない（候補全件分を解決すると楽天APIのレートリミットに
    // 掛かる）ため、選択した1件だけ後追いで解決する。失敗しても自動セットを諦めるだけ
    if (!result.booksGenreId) return;
    try {
      const idToken = await getIdToken();
      const res = await fetch(`/api/admin/games/rakuten-genre?booksGenreId=${encodeURIComponent(result.booksGenreId)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) return;
      const body = await res.json();
      applyRakutenGenre(body.genre ?? null);
    } catch (e) {
      console.error('楽天ブックスジャンル解決に失敗', e);
    }
  }

  // プレビューの「変更する」: 楽天との紐付け（商品ページURL・画像URL）を外して選び直せるようにする
  function handleClearRakutenSelection() {
    setSelectedRakuten(null);
    setPackageImageUrl('');
    setRakutenUrl('');
  }

  // 貼り付けた楽天ブックス商品ページURLから商品情報を取得してフォームに反映する
  async function handleFetchRakutenItem() {
    const normalized = normalizeRakutenBooksItemUrl(rakutenUrl);
    if (!normalized) return;
    setRakutenItemFetching(true);
    setRakutenItemError(null);
    try {
      const idToken = await getIdToken();
      const res = await fetch(`/api/admin/games/rakuten-item?url=${encodeURIComponent(normalized)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = await res.json();
      if (!res.ok) {
        setRakutenItemError(
          res.status === 404
            ? '商品情報を取得できませんでした。URLを確認するか、パッケージ画像URLを直接入力してください'
            : '取得に失敗しました。時間をおいて再試行するか、パッケージ画像URLを直接入力してください',
        );
        return;
      }
      const result: RakutenGameItem = body.result;
      applyRakutenItem(result, result.genre);
    } catch {
      setRakutenItemError('通信エラーが発生しました');
    } finally {
      setRakutenItemFetching(false);
    }
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
      const res = await fetch(initial ? `/api/admin/games/${encodeURIComponent(initial.id)}` : '/api/admin/games', {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          title: trimmedTitle,
          genreId: genreId || null,
          themeIds: [...themeIds],
          platforms: [...platforms],
          packageImageUrl: packageImageUrl.trim() || null,
          rakutenUrl: rakutenUrl.trim() || null,
          description: description.trim() || null,
          ...(initial ? { isAiGeneratedDescription } : {}),
        }),
      });
      const resBody = await res.json();
      if (!res.ok) {
        if (resBody.error === 'already_exists') {
          setTitleError('同名のゲームタイトルが既に登録されています');
        } else {
          toast({ type: 'error', message: `${isEdit ? '保存' : '登録'}に失敗しました。時間をおいて再試行してください` });
        }
        return;
      }
      if (initial) {
        onUpdated?.();
        toast({ type: 'success', message: 'ゲームタイトル情報を更新しました' });
      } else {
        onCreated?.({ id: resBody.id, title: resBody.title, packageImageUrl: resBody.packageImageUrl });
        toast({ type: 'success', message: 'ゲームタイトルを登録しました' });
      }
      onOpenChange(false);
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setSubmitting(false);
    }
  }

  const genreOptions = [{ value: '', label: '未設定' }, ...genres.map((g) => ({ value: g.id, label: g.name }))];
  const themeOptions = themes.map((t) => ({ value: t.id, label: t.name }));
  const themeNameById = new Map(themes.map((t) => [t.id, t.name]));
  const rakutenItemValid = normalizeRakutenBooksItemUrl(rakutenUrl) !== null;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={isEdit ? 'ゲームタイトルを編集する' : 'ゲームタイトルを登録する'} maxWidthClassName="max-w-[560px]">
      <div className="flex flex-col gap-4">
        {/* 検索・URL取得のどちらも同じ自動セットにつながるため、1つの枠にまとめて説明文を共有する
            （2026-09-22、ユーザー指摘: 説明文がURL欄だけにかかるように見えていた） */}
        <div className="flex flex-col gap-3 rounded-[8px] border border-border-card p-3">
          <p className="text-md text-text-muted">
            検索して候補を選ぶか、商品ページURLを貼って「取得」すると、タイトル名・ジャンル・テーマ・機種・パッケージ画像を分かる範囲で自動セットします
          </p>

          <div className="flex flex-col gap-2">
            <p className="text-md text-text-tertiary">楽天ブックスでタイトルを検索</p>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="楽天ブックスで検索するタイトル名"
                aria-label="楽天ブックスで検索するタイトル名"
                value={rakutenQuery}
                onChange={(e) => setRakutenQuery(e.target.value)}
                disabled={submitting}
                autoFocus
              />
              <Button variant="secondary" onClick={handleRakutenSearch} loading={rakutenSearching} disabled={submitting || !rakutenQuery.trim()}>
                <SearchIcon size={14} />
                検索
              </Button>
            </div>

            {rakutenError && (
              <p role="alert" className="text-md text-input-error">
                {rakutenError}
              </p>
            )}

            {rakutenResults.length > 0 && (
              <div className="flex max-h-[240px] flex-col gap-1 overflow-y-auto rounded-[8px] border border-border-card p-1">
                {rakutenResults.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelectRakuten(r)}
                    className="flex items-center gap-3 rounded-[6px] p-2 text-left hover:bg-bg-input"
                  >
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.imageUrl} alt="" className="h-[64px] w-[48px] shrink-0 rounded-[4px] object-cover" />
                    ) : (
                      <div className="h-[64px] w-[48px] shrink-0 rounded-[4px] bg-bg-btn" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm text-text-primary">{r.title}</p>
                      <p className="text-xs text-text-tertiary">{[r.hardware, r.salesDate].filter(Boolean).join(' / ')}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {rakutenSearched && !rakutenSearching && !rakutenError && !selectedRakuten && rakutenResults.length === 0 && (
              <p className="text-md text-text-tertiary">見つかりませんでした。楽天ブックス商品ページURLを貼るか、パッケージ画像URLを直接入力してください</p>
            )}
          </div>

          <Field
            label="楽天ブックス商品ページURL"
            error={rakutenItemError}
            hint={rakutenUrl.trim() && !rakutenItemValid ? 'https://books.rakuten.co.jp/rb/…/ 形式のURLを入力してください' : undefined}
          >
            {(props) => (
              <div className="flex gap-2">
                <Input
                  {...props}
                  type="url"
                  placeholder="https://books.rakuten.co.jp/rb/…/"
                  value={rakutenUrl}
                  onChange={(e) => {
                    setRakutenUrl(e.target.value);
                    setRakutenItemError(null);
                    // URLを編集したら以前の取得結果のプレビューは古くなるので消す（画像URL自体は残す）
                    setSelectedRakuten(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && rakutenItemValid && !rakutenItemFetching) {
                      e.preventDefault();
                      handleFetchRakutenItem();
                    }
                  }}
                  disabled={submitting}
                />
                <Button variant="secondary" onClick={handleFetchRakutenItem} loading={rakutenItemFetching} disabled={submitting || !rakutenItemValid}>
                  取得
                </Button>
              </div>
            )}
          </Field>
        </div>

        {selectedRakuten && (
          <RakutenItemPreview
            item={selectedRakuten}
            action={
              <Button variant="ghost" size="sm" onClick={handleClearRakutenSelection} disabled={submitting}>
                変更する
              </Button>
            }
          />
        )}

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

        <MultiSelectField
          label="テーマ"
          placeholder="テーマを選択"
          filterPlaceholder="テーマ名で絞り込み"
          options={themeOptions}
          values={themeIds}
          onToggle={toggleTheme}
          labelOf={(id) => themeNameById.get(id) ?? id}
          disabled={submitting || themes.length === 0}
        />

        <MultiSelectField
          label="プラットフォーム"
          placeholder="プラットフォームを選択"
          filterPlaceholder="機種名で絞り込み"
          options={PLATFORM_SELECT_OPTIONS}
          values={platforms}
          onToggle={togglePlatform}
          labelOf={(p) => p}
          disabled={submitting}
        />

        <Field label="パッケージ画像URL" hint="楽天ブックスに無いタイトルは画像URLを直接入力できます">
          {(props) => (
            <Input {...props} type="url" value={packageImageUrl} onChange={(e) => setPackageImageUrl(e.target.value)} disabled={submitting} />
          )}
        </Field>

        <Field label="説明文（任意）">
          {(props) => <Textarea {...props} value={description} onChange={(e) => setDescription(e.target.value)} disabled={submitting} />}
        </Field>
        {isEdit && !!description.trim() && (
          <div className="flex">
            <ToggleChip
              label="「AIによる生成」バッジを表示する"
              selected={isAiGeneratedDescription}
              onClick={() => setIsAiGeneratedDescription((v) => !v)}
              disabled={submitting}
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>
            {isEdit ? '保存する' : '登録する'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// 楽天ブックスから取得した商品のプレビュー（サムネイル＋商品名）。商品ページURLの取得結果と
// タイトル検索の候補選択結果で共用。actionは右端に置く操作ボタン（「変更する」）
function RakutenItemPreview({ item, action }: { item: { title: string; imageUrl: string }; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[8px] border border-border-card bg-bg-input p-2">
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="h-[64px] w-[48px] shrink-0 rounded-[4px] object-cover" />
      ) : (
        <div className="h-[64px] w-[48px] shrink-0 rounded-[4px] bg-bg-btn" />
      )}
      <p className="line-clamp-2 flex-1 text-sm text-text-primary">{item.title}</p>
      {action}
    </div>
  );
}

// 複数選択の入力欄（テーマ・プラットフォーム）。候補が多いので一覧はプルダウンに畳み、
// 選択済みだけをチップで並べる（チップのクリックで解除）
function MultiSelectField({
  label,
  placeholder,
  filterPlaceholder,
  options,
  values,
  onToggle,
  labelOf,
  disabled,
}: {
  label: string;
  placeholder: string;
  filterPlaceholder?: string;
  options: Array<{ value: string; label: string }>;
  values: Set<string>;
  onToggle: (value: string) => void;
  labelOf: (value: string) => string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-md text-text-tertiary">{label}</p>
      <MultiSelectMenu
        values={values}
        onToggle={onToggle}
        options={options}
        placeholder={placeholder}
        filterPlaceholder={filterPlaceholder}
        aria-label={label}
        disabled={disabled}
      />
      {values.size > 0 && (
        <div className="flex flex-wrap gap-2">
          {[...values].map((v) => (
            <ToggleChip key={v} label={labelOf(v)} selected onClick={() => onToggle(v)} disabled={disabled} />
          ))}
        </div>
      )}
    </div>
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
