# ゲムコメ (GameCome)

YouTubeゲーム実況シリーズのレビュー・評価プラットフォーム。視聴者が実況シリーズを発見・評価し、視聴進捗を記録し、お気に入りを管理するためのサービス。

## 開発環境セットアップ

### 必須ツール
- Node.js 20.x以上
- npm
- Firebase プロジェクト（認証情報は`lib/firebase.ts`に直接記述）

### 環境変数
`.env.local`に以下を設定：
```
YOUTUBE_API_KEY=xxxxxxxxxxxxxxxxxxxxx
```

### 🚨 触ってはいけないファイル
- `.env.local` - YouTube APIキー（Gitで管理されていない）
- `lib/firebase.ts` - Firebase認証情報が平文で記述されている


## 開発ルール

### 1. コード生成規約
各ファイルの冒頭には日本語のコメントで仕様を記述する。

```typescript
/**
 * 2点間のユークリッド距離を計算する
 **/
type Point = { x: number; y: number };
export function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
```

### 2. 秘密情報は絶対にコミットしない
- `.env.local` (YouTube API Key)
- `lib/firebase.ts` (Firebase認証情報が直接記述されている)
