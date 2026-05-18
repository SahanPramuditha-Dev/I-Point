$ROOT = $PSScriptRoot

# Firebase backup-only configuration (offline-first safe).
# This project uses Firebase only for backup upload/metadata, not live app data.
$FirebaseServiceAccountPath = "C:\secure\istore\i-point-dbe5c-firebase-adminsdk-fbsvc-a6e4401a06.json"
$FirebaseBucket = "i-point-dbe5c.firebasestorage.app"
$FirebaseBackupEnabled = "true"

# 1. Start Backend
Write-Host "Starting Backend..." -ForegroundColor Cyan
if (Test-Path $FirebaseServiceAccountPath) {
    Write-Host "Firebase service account found: $FirebaseServiceAccountPath" -ForegroundColor Green
} else {
    Write-Host "Firebase service account not found at: $FirebaseServiceAccountPath" -ForegroundColor Yellow
    Write-Host "Cloud backup upload will stay disabled until path is fixed." -ForegroundColor Yellow
    $FirebaseBackupEnabled = "false"
}

$backendCmd = @"
cd '$ROOT\backend';
.\.venv\Scripts\activate;
`$env:FIREBASE_BACKUP_ENABLED='$FirebaseBackupEnabled';
`$env:FIREBASE_SERVICE_ACCOUNT='$FirebaseServiceAccountPath';
`$env:FIREBASE_BUCKET='$FirebaseBucket';
`$env:FIREBASE_STORE_METADATA='true';
`$env:FIREBASE_METADATA_COLLECTION='backup_metadata';
`$env:FIREBASE_PRUNE_REMOTE_KEEP='30';
`$env:BACKUP_SCHEDULE_ENABLED='true';
`$env:BACKUP_SCHEDULE_HOUR='23';
`$env:BACKUP_SCHEDULE_MINUTE='30';
`$env:BACKUP_SCHEDULE_TIMEZONE='Asia/Colombo';
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

# 2. Start Frontend
Write-Host "Starting Frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ROOT\frontend'; npm run dev"

# 3. Wait for services to initialize
Write-Host "Waiting for services to warm up..." -ForegroundColor Yellow
Start-Sleep -Seconds 7

# 4. Start Electron
Write-Host "Starting Electron Shell..." -ForegroundColor Cyan
Set-Location -Path "$ROOT\electron"
npm run dev
