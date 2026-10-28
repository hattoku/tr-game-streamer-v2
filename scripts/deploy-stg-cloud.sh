#!/bin/bash
set -euo pipefail

# クラウド環境（Claude Code on the web 等）から stg へデプロイするスクリプト
# 使い方: ./scripts/deploy-stg-cloud.sh
#
# ローカル用の deploy.sh / deploy.ps1 との違い:
# - stg 専用。prod へのデプロイはできない（prod はローカルから deploy.ps1 で行う）
# - 認証はクラウド環境の環境変数 GCP_SA_KEY_STG_B64（stg 専用サービスアカウント鍵JSONをbase64化した1行）を使う
# - .env.local が無い前提のため --update-env-vars を渡さない。Cloud Run の YOUTUBE_API_KEY 等は
#   既存リビジョンの値がそのまま引き継がれる（値を変えたいときはローカルから deploy.ps1 を使う）
# - RAKUTEN_AFFILIATE_ID はビルド時埋め込み値なので、クラウド環境の環境変数から渡す（未設定なら空）
# - テストモード（UI仕様書 §7）は stg では常時有効にする（_TEST_MODE=true。E2Eテストがテスト用会員でログインするため）
# - --allow-unauthenticated は付けない（公開設定は既存サービスに設定済みで、付けると IAM 変更権限が要るため）
# - ビルドは --async で投入して状態をポーリングする（ログのストリーミングに Project Viewer 権限が要るのを避ける）
# - ソースのアップロード先を --gcs-source-staging-dir で明示する（既定バケットの確認に storage.buckets.list が要るのを避ける）

PROJECT_ID="tr-game-streamer-stg"
STORAGE_BUCKET="${PROJECT_ID}.firebasestorage.app"
REPO_NAME="tr-game-streamer"
SERVICE_NAME="puremite"
REGION="asia-northeast1"
IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}"
RAKUTEN_AFFILIATE_ID="${RAKUTEN_AFFILIATE_ID:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if [ -z "${GCP_SA_KEY_STG_B64:-}" ]; then
  echo "ERROR: 環境変数 GCP_SA_KEY_STG_B64 が設定されていません"
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
gcloud auth activate-service-account --key-file "$KEY_FILE" --quiet
gcloud config set project "$PROJECT_ID" --quiet

echo "--- Deploying to STAGING ($PROJECT_ID) from cloud ---"

# 1. ビルドとプッシュ
echo "Building and pushing Docker image..."
BUILD_ID="$(gcloud builds submit --config cloudbuild.yaml \
  --substitutions "_IMAGE_URL=$IMAGE_URL,_APP_ENV=stg,_RAKUTEN_AFFILIATE_ID=$RAKUTEN_AFFILIATE_ID,_TEST_MODE=true" \
  --gcs-source-staging-dir "gs://${PROJECT_ID}_cloudbuild/source" \
  --async --format 'value(id)' .)"
echo "Build ID: $BUILD_ID"
while true; do
  STATUS="$(gcloud builds describe "$BUILD_ID" --format 'value(status)')"
  case "$STATUS" in
    SUCCESS) echo "Build succeeded."; break ;;
    QUEUED|WORKING|PENDING) sleep 15 ;;
    *)
      echo "ERROR: Build finished with status $STATUS"
      echo "Log: https://console.cloud.google.com/cloud-build/builds/$BUILD_ID?project=$PROJECT_ID"
      exit 1
      ;;
  esac
done

# 2. Firestore ルール・インデックスと Storage ルールをデプロイ（新コードが依存するため Cloud Run より先に反映する）
echo "Deploying Firestore rules and indexes..."
npx --yes firebase-tools@15 deploy --only firestore:rules,firestore:indexes --project "$PROJECT_ID" --non-interactive

# Storage ルールは Firebase Rules API で直接反映する。firebase-tools の storage デプロイは既定バケットの取得
# （firebasestorage.defaultBucket.get）が stg では SA から 404 になり失敗するため（2026-10-28）。
# 反映先は stg のバケットに固定する。SA に Firebase Rules の権限（Firestore ルールのデプロイと同じ）が要る
echo "Deploying Storage rules to gs://$STORAGE_BUCKET ..."
ACCESS_TOKEN="$(gcloud auth print-access-token)"
RULES_API="https://firebaserules.googleapis.com/v1/projects/$PROJECT_ID"
RULESET_BODY="$(python3 -c 'import json,sys; print(json.dumps({"source": {"files": [{"name": "storage.rules", "content": open(sys.argv[1]).read()}]}}))' storage.rules)"
RULESET_NAME="$(curl -sSf -X POST -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d "$RULESET_BODY" "$RULES_API/rulesets" | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')"
RELEASE_NAME="projects/$PROJECT_ID/releases/firebase.storage/$STORAGE_BUCKET"
curl -sSf -X PATCH -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"release\":{\"name\":\"$RELEASE_NAME\",\"rulesetName\":\"$RULESET_NAME\"}}" \
  "https://firebaserules.googleapis.com/v1/$RELEASE_NAME" > /dev/null
echo "Storage rules released: $RULESET_NAME"

# 3. Cloud Run へデプロイ
echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_URL" \
  --region "$REGION" \
  --platform managed \
  --quiet

# 4. Firebase Hosting デプロイ (Cloud Run へのリライト設定を反映)
echo "Deploying to Firebase Hosting..."
npx --yes firebase-tools@15 deploy --only hosting:app --project "$PROJECT_ID" --non-interactive

echo "Done! Deployment to stg is complete."
