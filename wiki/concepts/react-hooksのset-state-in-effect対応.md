---
title: react-hooksのset-state-in-effect対応
type: concept
date: 2026-09-13
updated: 2026-09-15
---

# react-hooksのset-state-in-effect対応

`eslint-plugin-react-hooks` v7（[[2026-09-13-phase2.5-finish]]で導入）の
`react-hooks/set-state-in-effect`ルールは、`useEffect`の本体で**同期的に**`setState`を呼ぶコードを
検出する。フェーズ3のステップ1〜3（[[2026-09-13-phase3-step1-reviews]]・
[[2026-09-14-phase3-step2-games]]・[[2026-09-15-phase3-step3-tags]]）で繰り返し発生し、
2つの定型対応パターンで解消してきた。

## パターン1: 外部システム（Firestore等）の購読はコールバック内・クリーンアップで

`if (!user) { setX(初期値); return; }` のように、購読条件が満たされない場合の早期リセットを
effect本体の先頭で直接呼ぶと引っかかる。`onSnapshot`のコールバック内でのsetStateは問題ないため
（そこは「外部システムからのイベントに応答してsetStateする」正当な用途）、早期リセットは
購読解除時のクリーンアップ関数に移す。

```tsx
// NG: effect本体で直接setState
useEffect(() => {
  if (!user) {
    setValue(初期値);
    return;
  }
  return onSnapshot(ref, (snap) => setValue(snap.data()));
}, [user]);

// OK: クリーンアップで戻す
useEffect(() => {
  if (!user) return;
  const unsubscribe = onSnapshot(ref, (snap) => setValue(snap.data()));
  return () => {
    unsubscribe();
    setValue(初期値);
  };
}, [user]);
```

`components/layout/NotificationBell.tsx`が最初にこの形で書かれており、以降のコンポーネントは
これに倣った（`ReviewForm`・`ReviewList`の購読系effectなど）。

## パターン2: 「propが変わったらstateを調整する」は描画中に直接setStateする

ページネーションの`page`を検索条件変更時に1へ戻す、モーダルを開いた瞬間に下書きstateを
リセットする、非同期取得したデータが揃った時点で一度だけURLクエリの値を反映する、といった
「ある値の変化を検知してstateを合わせる」ケースは、effectを使わずReact公式が推奨する
「描画中に直接setStateする」パターンで書く。effect経由だと1テンポ余分な再描画が入るうえ、
このルールにも引っかかる。

```tsx
// NG: 依存配列の変化をeffectで検知してsetState
useEffect(() => {
  setPage(1);
}, [keyword, selectedGenreIds, sort]);

// OK: 前回値との比較を描画中に行い、変化していたら直接setStateする
const filterKey = `${keyword}|${[...selectedGenreIds].sort().join(',')}|${sort}`;
const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
if (filterKey !== prevFilterKey) {
  setPrevFilterKey(filterKey);
  setPage(1);
}
```

同じ形を`GamePlaylistSection`（ソート変更時のページリセット）、`TagEditModal`
（モーダルが開いた瞬間の下書きリセット、`open`のtrue/false比較）、`app/(main)/playlists/new/page.tsx`
（`games`が非同期に揃った後の`?gameId=`プレフィル、一度適用したら`appliedGameIdParam`で
再適用しないようにする）でも使っている。

## パターン3: 導出できる値はstateに持たずレンダー時に計算する

`ReviewForm`の`urlError`（コメント本文からURLの有無を判定するだけ）は、当初effectで
`comment`の変化を見て`setUrlError(...)`していたが、これは単なる導出値でありstate化する
必要が無い。`const urlError = comment.includes('http://') ... ? ... : null;`のように
描画時に直接計算する形に直した。

一方、NGワード判定（`ngWordError`）はサーバーへの非同期問い合わせ結果を保持する必要があるため
真のstateとして残し、「コメントが空のときは前回の判定結果を無視する」という導出条件だけ
`ngWordDisplayError`という別の描画時計算値に切り出した。

## localStorage初期値はuseStateの遅延初期化で読む

`ReviewList`のネタバレ非表示設定（未ログイン時はlocalStorage、ログイン時はFirestore購読）は、
「初回描画時に一度だけ読む」という性質のためeffectではなく`useState(() => {...})`の
遅延初期化関数内で読むようにした（`typeof window === 'undefined'`でSSRをガード）。
ログイン時のFirestore購読は通常のeffect＋コールバック内setState（パターン1）で上書きする。

## 関連
- [[2026-09-13-phase2.5-finish]]（ESLint導入とこのルールの初出3件）
- [[2026-09-13-phase3-step1-reviews]]
- [[2026-09-14-phase3-step2-games]]
- [[2026-09-15-phase3-step3-tags]]
