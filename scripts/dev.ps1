# dev.ps1 — single-command local dev launcher (Windows PowerShell)
# Starts FastAPI on :8000 and Vite on :5173 in parallel, with shared stdout.
#
# Usage:
#   .\scripts\dev.ps1
#   .\scripts\dev.ps1 -NoRefresher   # skip the live refresher (offline-friendly)

param(
    [switch]$NoRefresher
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo

if ($NoRefresher) {
    $env:F1ML_DISABLE_REFRESHER = "1"
    Write-Host "→ Live refresher disabled" -ForegroundColor Yellow
}

Write-Host "→ Starting FastAPI on http://localhost:8000" -ForegroundColor Cyan
$apiJob = Start-Job -Name f1ml-api -ScriptBlock {
    param($cwd, $envFlag)
    Set-Location $cwd
    if ($envFlag) { $env:F1ML_DISABLE_REFRESHER = "1" }
    & uvicorn src.api.main:app --reload --port 8000
} -ArgumentList $repo, $NoRefresher

Write-Host "→ Starting Vite on http://localhost:5173" -ForegroundColor Cyan
$webJob = Start-Job -Name f1ml-web -ScriptBlock {
    param($cwd)
    Set-Location (Join-Path $cwd "web")
    & pnpm dev
} -ArgumentList $repo

Write-Host ""
Write-Host "Press Ctrl+C to stop both processes." -ForegroundColor Green

try {
    while ($true) {
        Receive-Job -Job $apiJob -Keep
        Receive-Job -Job $webJob -Keep
        Start-Sleep -Seconds 1
    }
}
finally {
    Write-Host ""
    Write-Host "→ Stopping background jobs..." -ForegroundColor Yellow
    Stop-Job -Job $apiJob, $webJob -ErrorAction SilentlyContinue
    Remove-Job -Job $apiJob, $webJob -Force -ErrorAction SilentlyContinue
    Pop-Location
}
