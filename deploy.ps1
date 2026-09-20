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

# YouTube Data API キー・CRON_SECRET は public リポジトリに直書きせず、ローカルの .env.local から
# 読み取ってデプロイ時にのみ Cloud Run の環境変数として注入する（SECRET_MANAGEMENT.md参照）
$EnvLocalPath = Join-Path $PSScriptRoot ".env.local"
$YoutubeApiKeyLine = Get-Content $EnvLocalPath | Where-Object { $_ -match '^YOUTUBE_API_KEY=' }
if (-not $YoutubeApiKeyLine) {
    Write-Host "ERROR: .env.local に YOUTUBE_API_KEY が見つかりません" -ForegroundColor Red
    exit 1
}
$YoutubeApiKey = ($YoutubeApiKeyLine -split '=', 2)[1]

$CronSecretLine = Get-Content $EnvLocalPath | Where-Object { $_ -match '^CRON_SECRET=' }
if (-not $CronSecretLine) {
    Write-Host "ERROR: .env.local に CRON_SECRET が見つかりません" -ForegroundColor Red
    exit 1
}
$CronSecret = ($CronSecretLine -split '=', 2)[1]

# 1. ビルドとプッシュ
Write-Host "Building and pushing Docker image..." -ForegroundColor Green
gcloud builds submit --config cloudbuild.yaml --substitutions "_IMAGE_URL=$ImageUrl,_APP_ENV=$Env" . --project "$ProjectId"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker image build failed (exit code $LASTEXITCODE). Aborting deploy." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 2. Cloud Run へデプロイ
Write-Host "Deploying to Cloud Run..." -ForegroundColor Green
gcloud run deploy "$ServiceName" `
    --image "$ImageUrl" `
    --region "$Region" `
    --platform managed `
    --allow-unauthenticated `
    --update-env-vars "YOUTUBE_API_KEY=$YoutubeApiKey,CRON_SECRET=$CronSecret" `
    --project "$ProjectId"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Cloud Run deploy failed (exit code $LASTEXITCODE). Aborting deploy." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 3. Firebase Hosting デプロイ
Write-Host "Deploying to Firebase Hosting..." -ForegroundColor Green
# ターゲット名を指定してデプロイ
firebase deploy --only hosting:app --project "$ProjectId"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Firebase Hosting deploy failed (exit code $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Done! Deployment to $Env is complete." -ForegroundColor Green
