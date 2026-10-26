#!/bin/bash
set -euo pipefail

# stg に対して E2E テスト（Playwright）を実行するスクリプト（クラウド環境用）
# 使い方: ./scripts/run-e2e-stg.sh [playwright test の引数...]
#   例: ./scripts/run-e2e-stg.sh e2e/smoke.spec.ts --project desktop
#
# - 接続先は stg の Cloud Run（gcloud run services describe で取得）。E2E_BASE_URL を指定すればそちらを使う
# - 認証はクラウド環境の環境変数 GCP_SA_KEY_STG_B64（stg 専用サービスアカウント）。テストデータの後始末
#   （e2e/support/cleanup.ts）が Firestore を読み書きするため、SA に roles/datastore.user が必要
# - stg ゲートのパスワードはクラウド環境の環境変数 STAGING_GATE_PASSWORD
# - stg はテストモード（UI仕様書 §7）が有効でビルドされている必要がある（scripts/deploy-stg-cloud.sh は常に有効にする）
# 計画: plans/自動テスト-E2E-実装計画.md

PROJECT_ID="tr-game-streamer-stg"
SERVICE_NAME="puremite"
REGION="asia-northeast1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if [ -z "${GCP_SA_KEY_STG_B64:-}" ]; then
  echo "ERROR: 環境変数 GCP_SA_KEY_STG_B64 が設定されていません"
  exit 1
fi
if [ -z "${STAGING_GATE_PASSWORD:-}" ]; then
  echo "ERROR: 環境変数 STAGING_GATE_PASSWORD が設定されていません（クラウド環境の設定で追加し、新しいセッションで実行してください）"
  exit 1
fi

# 鍵ファイルと gcloud 設定はこのスクリプト専用の一時ディレクトリに置き、終了時に消す
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
KEY_FILE="$WORK_DIR/key.json"
(umask 077 && printf '%s' "$GCP_SA_KEY_STG_B64" | base64 -d > "$KEY_FILE")

# 鍵の project_id が stg であることを確認する（prod の鍵を誤って登録した場合の事故防止）
KEY_PROJECT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["project_id"])' "$KEY_FILE")"
if [ "$KEY_PROJECT" != "$PROJECT_ID" ]; then
  echo "ERROR: 鍵の project_id が $KEY_PROJECT です。$PROJECT_ID の鍵のみ使用できます"
  exit 1
fi

export CLOUDSDK_CONFIG="$WORK_DIR/gcloud"
unset CLOUDSDK_AUTH_ACCESS_TOKEN
export GOOGLE_APPLICATION_CREDENTIALS="$KEY_FILE"

if [ -z "${E2E_BASE_URL:-}" ]; then
  gcloud auth activate-service-account --key-file "$KEY_FILE" --quiet >/dev/null 2>&1
  E2E_BASE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format 'value(status.url)')"
fi
export E2E_BASE_URL
echo "--- E2E against $E2E_BASE_URL ---"

npx playwright test "$@"
