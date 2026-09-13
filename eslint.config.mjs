// ESLint 設定（フラット設定）。実行: npm run lint
// Next.js 16 は `next lint` を廃止した（node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md）。
// 公式手順の `eslint-config-next` は typescript-eslint を使うが、typescript-eslint は TypeScript 7.0 に未対応で
// 読み込み時に例外を投げる（https://github.com/typescript-eslint/typescript-eslint/issues/10940）。
// 公式の回避策は `typescript` パッケージを TS 6 互換パッケージ（@typescript/typescript6）へ別名解決させる方法だが、
// プロジェクトの TypeScript 7 採用（技術スタック決定）に影響するため採らず、TypeScript に依存しない
// @babel/eslint-parser（@babel/parser の typescript / jsx 構文プラグイン）で TS/TSX を構文解析し、同じ構成要素
// （@next/eslint-plugin-next の core-web-vitals ＋ eslint-plugin-react-hooks）を直接組む。
// 型情報を使うルール（typescript-eslint 系）は無い。typescript-eslint が TS 7 に対応したら
// eslint-config-next に戻してよい（HANDOFF.md 未解決事項 10、wiki/sources/2026-09-13-phase2.5-finish.md）。
import { defineConfig, globalIgnores } from 'eslint/config';
import babelParser from '@babel/eslint-parser';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';

/** @param {string[]} syntaxPlugins @babel/parser の構文プラグイン */
function languageOptions(syntaxPlugins) {
  return {
    parser: babelParser,
    parserOptions: {
      requireConfigFile: false,
      babelOptions: { parserOpts: { plugins: syntaxPlugins } },
    },
    ecmaVersion: 'latest',
    sourceType: 'module',
  };
}

const plugins = {
  '@next/next': nextPlugin,
  'react-hooks': reactHooks,
};

const rules = {
  ...nextPlugin.configs['core-web-vitals'].rules,
  ...reactHooks.configs.flat.recommended.rules,
};

export default defineConfig([
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'node_modules/**', 'document/design/**']),
  { files: ['**/*.{js,mjs,cjs}'], languageOptions: languageOptions(['jsx']), plugins, rules },
  // .ts では jsx を有効にしない（ジェネリクス `<T>` が JSX と衝突するため）
  { files: ['**/*.{ts,mts,cts}'], languageOptions: languageOptions(['typescript']), plugins, rules },
  { files: ['**/*.tsx'], languageOptions: languageOptions(['typescript', 'jsx']), plugins, rules },
]);
