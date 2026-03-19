# Cloud Run デプロイ用 PowerShell スクリプト
# 使い方: .\deploy.ps1 [stg|prod]

param (
    [Parameter(Mandatory=$true)]
    [ValidateSet("stg", "prod")]
    $Env
)

$ErrorActionPreference = "Stop"

if ($Env -eq "stg") {
    $ProjectId = "tr-game-streamer-stg"
    Write-Host "--- Deploying to STAGING ($ProjectId) ---" -ForegroundColor Cyan
} else {
    $ProjectId = "tr-game-streamer"
    Write-Host "--- Deploying to PRODUCTION ($ProjectId) ---" -ForegroundColor Yellow
}

$RepoName = "tr-game-streamer"
$ServiceName = "puremite"
$Region = "asia-northeast1"
$ImageUrl = "${Region}-docker.pkg.dev/${ProjectId}/${RepoName}/${ServiceName}"

# 1. ビルドとプッシュ
Write-Host "Building and pushing Docker image..." -ForegroundColor Green
gcloud builds submit --config cloudbuild.yaml --substitutions "_IMAGE_URL=$ImageUrl,_APP_ENV=$Env" . --project "$ProjectId"

# 2. Cloud Run へデプロイ
Write-Host "Deploying to Cloud Run..." -ForegroundColor Green
gcloud run deploy "$ServiceName" `
    --image "$ImageUrl" `
    --region "$Region" `
    --platform managed `
    --allow-unauthenticated `
    --project "$ProjectId"

# 3. Firebase Hosting デプロイ
Write-Host "Deploying to Firebase Hosting..." -ForegroundColor Green
firebase deploy --only hosting --project "$ProjectId"

Write-Host "Done! Deployment to $Env is complete." -ForegroundColor Green
