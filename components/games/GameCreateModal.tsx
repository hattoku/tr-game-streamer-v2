/**
 * ゲームタイトル新規登録モーダル（管理者専用、フェーズ4.5ステップ2）。
 * GameSelectModalのフッター「見つからない場合」導線から開く。一般ユーザー向けの
 * 「登録を提案する」モーダル（ページ 再生リストを追加する 仕様書 §4.2.2）とは別物で、
 * 審査を経ずその場で`games`に直接書き込む（同仕様書 §4.2.2 末尾の対象ユーザー注記のとおり、
 * 管理者はマスタ管理相当の直接登録ができるため提案フローの対象外）。
 * パッケージ画像は楽天ブックスゲーム検索API（フェーズ4.5ステップ8）でのタイトル検索→候補選択が
 * デフォルト。検索でヒットしない場合（洋ゲー・マイナータイトル等）のためURL手入力にも切替可能。
 * URL手入力モードでは楽天ブックス商品ページURLを貼って「取得」すると、パッケージ画像URL・商品名が
 * 自動でセットされる（`/api/admin/games/rakuten-item`。フェーズ5、2026-09-21）。楽天に無い
 * タイトル向けにパッケージ画像URLの直接入力も残している。
 * どちらのモードでも、楽天の商品情報からゲームタイトル名（未入力時のみ）・ジャンル（未選択時のみ）・
 * テーマ・プラットフォームを分かる範囲で自動セットする（applyRakutenItem参照。ジャンル/テーマは
 * 楽天のカテゴリ名とマスタ名の一致で照合、機種はPLATFORM_OPTIONSと一致したもののみ）。
 */
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SelectMenu } from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/Toast';
import { CheckIcon, SearchIcon } from '@/components/ui/icons';
import type { GameOption } from '@/components/playlists/GameSelectModal';
import type { RakutenGameItem, RakutenGameSearchResult, RakutenGenreInfo } from '@/lib/rakuten';
import { normalizeRakutenBooksItemUrl, normalizeRakutenGameTitle, toMasterThemeName } from '@/lib/rakuten-shared';

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

  // パッケージ画像: 楽天ブックス検索（デフォルト）⇔ URL手入力
  const [imageMode, setImageMode] = useState<'search' | 'manual'>('search');
  const [rakutenQuery, setRakutenQuery] = useState('');
  const [rakutenQueryTouched, setRakutenQueryTouched] = useState(false);
  const [rakutenSearching, setRakutenSearching] = useState(false);
  const [rakutenSearched, setRakutenSearched] = useState(false);
  const [rakutenError, setRakutenError] = useState<string | null>(null);
  const [rakutenResults, setRakutenResults] = useState<RakutenGameSearchResult[]>([]);
  // 検索モードでの候補選択、またはURL手入力モードでの商品ページURL取得の結果（プレビュー表示用）
  const [selectedRakuten, setSelectedRakuten] = useState<{ title: string; imageUrl: string } | null>(null);

  // URL手入力モード: 楽天ブックス商品ページURLからの取得状態
  const [rakutenItemFetching, setRakutenItemFetching] = useState(false);
  const [rakutenItemError, setRakutenItemError] = useState<string | null>(null);

  // 検索キーワード未編集の間は、ゲームタイトル名の入力にそのまま追従させる（別々に入力させるより
  // 「タイトルを打てば検索候補も揃っている」体験のほうが手数が少ないため）。wasOpenと同じ
  // 「propが変わったらstateを調整する」パターン（effect内のsetStateより1テンポ早い）
  const [prevTitleForQuery, setPrevTitleForQuery] = useState(title);
  if (title !== prevTitleForQuery) {
    setPrevTitleForQuery(title);
    if (!rakutenQueryTouched) setRakutenQuery(title);
  }

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
      setImageMode('search');
      setRakutenQuery('');
      setPrevTitleForQuery('');
      setRakutenQueryTouched(false);
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
        setRakutenError('検索に失敗しました。時間をおいて再試行するか、URLを直接入力してください');
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

  // 楽天の商品情報をフォームに反映する（検索モードの候補選択・URL手入力モードの取得で共通）。
  // 管理者が既に入力・選択した値は上書きしない（タイトル・ジャンルは空のときだけ、テーマ・機種は追加のみ）
  function applyRakutenItem(result: RakutenGameSearchResult, genre: RakutenGenreInfo | null) {
    setSelectedRakuten({ title: result.title, imageUrl: result.imageUrl });
    setPackageImageUrl(result.imageUrl);
    setRakutenUrl(result.itemUrl);

    const normalizedTitle = normalizeRakutenGameTitle(result.title);
    if (!title.trim() && normalizedTitle) {
      setTitle(normalizedTitle);
      setTitleError(null);
    }
    if (PLATFORM_OPTIONS.includes(result.hardware)) {
      setPlatforms((prev) => new Set(prev).add(result.hardware));
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

  function handleClearRakutenSelection() {
    setSelectedRakuten(null);
    setPackageImageUrl('');
    setRakutenUrl('');
  }

  // URL手入力モード: 貼り付けた楽天ブックス商品ページURLから商品情報を取得してフォームに反映する
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
  const rakutenItemValid = normalizeRakutenBooksItemUrl(rakutenUrl) !== null;

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

        <div className="flex flex-col gap-2">
          <p className="text-md text-text-tertiary">パッケージ画像（任意）</p>
          {imageMode === 'search' ? (
            <>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="楽天ブックスで検索するタイトル名"
                  aria-label="楽天ブックスで検索するタイトル名"
                  value={rakutenQuery}
                  onChange={(e) => {
                    setRakutenQuery(e.target.value);
                    setRakutenQueryTouched(true);
                  }}
                  disabled={submitting}
                />
                <Button
                  variant="secondary"
                  onClick={handleRakutenSearch}
                  loading={rakutenSearching}
                  disabled={submitting || !rakutenQuery.trim()}
                >
                  <SearchIcon size={14} />
                  検索
                </Button>
              </div>

              {rakutenError && (
                <p role="alert" className="text-md text-input-error">
                  {rakutenError}
                </p>
              )}

              {selectedRakuten ? (
                <RakutenItemPreview
                  item={selectedRakuten}
                  action={
                    <Button variant="ghost" size="sm" onClick={handleClearRakutenSelection} disabled={submitting}>
                      変更する
                    </Button>
                  }
                />
              ) : (
                rakutenResults.length > 0 && (
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
                )
              )}

              {rakutenSearched && !rakutenSearching && !rakutenError && !selectedRakuten && rakutenResults.length === 0 && (
                <p className="text-md text-text-tertiary">見つかりませんでした。URLを直接入力してください</p>
              )}

              <Button variant="ghost" size="sm" className="self-start" onClick={() => setImageMode('manual')} disabled={submitting}>
                URLを直接入力する
              </Button>
            </>
          ) : (
            <>
              <Field
                label="楽天ブックス商品ページURL"
                error={rakutenItemError}
                hint={
                  rakutenUrl.trim() && !rakutenItemValid
                    ? 'https://books.rakuten.co.jp/rb/…/ 形式のURLを入力してください'
                    : 'URLを貼って「取得」すると、パッケージ画像のほかタイトル名・ジャンル・テーマ・機種も分かる範囲で自動セットします'
                }
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
                    <Button
                      variant="secondary"
                      onClick={handleFetchRakutenItem}
                      loading={rakutenItemFetching}
                      disabled={submitting || !rakutenItemValid}
                    >
                      取得
                    </Button>
                  </div>
                )}
              </Field>

              {selectedRakuten && <RakutenItemPreview item={selectedRakuten} />}

              <Field label="パッケージ画像URL" hint="楽天ブックスに無いタイトルは画像URLを直接入力できます">
                {(props) => (
                  <Input {...props} type="url" value={packageImageUrl} onChange={(e) => setPackageImageUrl(e.target.value)} disabled={submitting} />
                )}
              </Field>
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setImageMode('search')} disabled={submitting}>
                楽天ブックスで検索する
              </Button>
            </>
          )}
        </div>

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

// 楽天ブックスから取得した商品のプレビュー（サムネイル＋商品名）。検索モードの選択結果と
// URL手入力モードの取得結果で共用。actionは右端に置く操作ボタン（検索モードの「変更する」）
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

function ToggleChip({ label, selected, onClick, disabled }: { label: string; selected: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="secondary" size="sm" active={selected} aria-pressed={selected} onClick={onClick} disabled={disabled}>
      {selected && <CheckIcon size={11} />}
      {label}
    </Button>
  );
}
