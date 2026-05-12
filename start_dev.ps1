$ROOT = $PSScriptRoot

# 1. Start Backend
Write-Host "Starting Backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ROOT\backend'; .\.venv\Scripts\activate; python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

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
