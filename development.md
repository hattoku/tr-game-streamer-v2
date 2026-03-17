# ゲムコメ (GameCome)

YouTubeゲーム実況シリーズのレビュー・評価プラットフォーム。視聴者が実況シリーズを発見・評価し、視聴進捗を記録し、お気に入りを管理するためのサービス。

## 開発環境セットアップ

### 必須ツール
- Node.js 20.x以上
- npm
- Firebase プロジェクト（認証情報は`lib/firebase.ts`に直接記述）

### 🔑 秘密情報の管理
このプロジェクトでは、開発・共有の利便性のために以下の秘密情報を直接ソースコードに記述し、リポジトリに含めています。

- `lib/constants.ts` - YouTube APIキー
- `lib/firebase.ts` - Firebase認証情報


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

### 2. 秘密情報の扱い
- 開発の利便性のために、APIキー等の秘密情報はソースコード（`lib/constants.ts`, `lib/firebase.ts`等）に直接記述し、コミット対象に含めています。
- 新たに秘密情報を追加する場合も、同様の構成ファイルに追加することを検討してください。
