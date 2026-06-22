param(
  [switch]$WithScheduler
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

if (-not (Test-Path ".env")) {
  throw ".env not found. Run .\scripts\deploy-windows.ps1 first."
}

function Start-AppProcess {
  param([string]$Title, [string]$Command)
  Write-Host "Starting $Title..." -ForegroundColor Cyan
  Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "Set-Location '$Root'; $Command"
  )
}

Start-AppProcess "server" "pnpm --filter @pdd-inspector/server run start"
Start-AppProcess "worker" "pnpm --filter @pdd-inspector/worker run start"

if ($WithScheduler) {
  Start-AppProcess "scheduler" "pnpm --filter @pdd-inspector/scheduler run start"
}

Write-Host ""
Write-Host "Startup commands launched." -ForegroundColor Green
Write-Host "Open http://localhost:3000"
Write-Host "Use -WithScheduler when daily scheduled inspections should run."
