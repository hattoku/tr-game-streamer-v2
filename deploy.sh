#!/bin/bash
set -e

# Cloud Run デプロイスクリプト
# 使い方: ./deploy.sh [stg|prod]

ENV=$1

if [ "$ENV" = "stg" ]; then
  PROJECT_ID="tr-game-streamer-stg"
  echo "--- Deploying to STAGING ($PROJECT_ID) ---"
elif [ "$ENV" = "prod" ]; then
  PROJECT_ID="tr-game-streamer"
  echo "--- Deploying to PRODUCTION ($PROJECT_ID) ---"
else
  echo "Usage: ./deploy.sh [stg|prod]"
  exit 1
fi

REPO_NAME="tr-game-streamer"
SERVICE_NAME="puremite"
REGION="asia-northeast1"
IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}"

# 1. ビルドとプッシュ
echo "Building and pushing Docker image..."
gcloud builds submit --config cloudbuild.yaml --substitutions "_IMAGE_URL=$IMAGE_URL,_APP_ENV=$ENV" . --project "$PROJECT_ID"

# 2. Cloud Run へデプロイ
echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_URL" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --project "$PROJECT_ID"

# 3. Firebase Hosting デプロイ (Cloud Run へのリライト設定を反映)
echo "Deploying to Firebase Hosting..."
firebase deploy --only hosting --project "$PROJECT_ID"

echo "Done! Deployment to $ENV is complete."
