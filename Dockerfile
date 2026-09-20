# 1. 依存関係のインストール用ステージ
FROM node:20-alpine AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ecaf0ad0645f44251#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 依存関係ファイルをコピー
COPY package.json package-lock.json ./
RUN npm ci

# 2. ビルド用ステージ
FROM node:20-alpine AS builder

# ビルド引数の定義 (Next.js のビルド時に環境変数を埋め込むために必要)。
# Firebase Webアプリ設定は lib/firebase.ts に直書きしているためここでは渡さない。
# 接続先（stg/prod）の切り替えは NEXT_PUBLIC_APP_ENV のみ（lib/app-env.ts）。cloudbuild.yaml の _APP_ENV から渡される
ARG NEXT_PUBLIC_APP_ENV
# テストモードウィジェット（UI仕様書 §7）。stg 等の検証用ビルドでのみ true を渡す。本番では渡しても lib/app-env.ts が無効化する
ARG NEXT_PUBLIC_TEST_MODE

# 環境変数の設定
ENV NEXT_PUBLIC_APP_ENV=${NEXT_PUBLIC_APP_ENV}
ENV NEXT_PUBLIC_TEST_MODE=${NEXT_PUBLIC_TEST_MODE}

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js のビルドを実行
RUN npm run build

# 3. 実行用ステージ
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# ポート番号は Cloud Run のデフォルトに合わせて 8080 を指定するのが一般的
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# standalone モードの出力をコピー
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080

CMD ["node", "server.js"]
