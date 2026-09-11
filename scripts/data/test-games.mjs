// フェーズ2 開発用のテスト`games`データ。
//
// 再生リスト登録フローの「既存ゲームタイトルを検索して選択」導線を検証するための
// 最小データセット。実際の楽天ブックスAPI連携（フェーズ1完了時点で未実装、3.5節参照）は
// 別途バッチで賄う設計のため、ここでは`rakutenItemCode`等はnullとし、実在のタイトル名を
// 手入力する。genreId/themeIds/gameTagIdsは投入時にマスタ（genres/themes/tags）を名前で
// 引き当てて解決する（seed-test-games.mjs参照）。
export const TEST_GAMES = [
  {
    title: 'ゼルダの伝説 ティアーズ オブ ザ キングダム',
    platforms: ['Nintendo Switch'],
    genre: 'アドベンチャー',
    themes: ['アドベンチャー（一般）'],
    tags: ['ゼルダの伝説', 'オープンワールド'],
  },
  {
    title: 'ポケットモンスター スカーレット・バイオレット',
    platforms: ['Nintendo Switch'],
    genre: 'RPG',
    themes: ['オーソドックスRPG'],
    tags: ['ポケモン', 'オープンワールド'],
  },
  {
    title: 'スプラトゥーン3',
    platforms: ['Nintendo Switch'],
    genre: '格闘・アクション',
    themes: ['アクションゲーム'],
    tags: ['スプラトゥーン', 'マルチプレイ'],
  },
  {
    title: 'エルデンリング',
    platforms: ['PS5', 'Steam'],
    genre: 'RPG',
    themes: ['アクションRPG'],
    tags: ['エルデンリング', 'ソウルシリーズ', '高難易度'],
  },
  {
    title: 'モンスターハンターライズ',
    platforms: ['Nintendo Switch', 'Steam'],
    genre: '格闘・アクション',
    themes: ['アクションゲーム'],
    tags: ['モンスターハンター', 'マルチプレイ'],
  },
];
