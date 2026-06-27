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

# Ensure Redis is running
$dockerAvailable = $false
try {
  $job = Start-Job -ScriptBlock { docker --version 2>$null }
  $null = Wait-Job $job -Timeout 3
  $out = Receive-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -Force
  if ($out) { $dockerAvailable = $true }
} catch { }

if ($dockerAvailable) {
  Write-Host "Ensuring Redis is running via Docker..." -ForegroundColor Cyan
  $prevEAP = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  docker compose up -d redis 2>$null
  $ErrorActionPreference = $prevEAP
  Write-Host "Redis ready." -ForegroundColor Green
} elseif (Get-Command "redis-cli" -ErrorAction SilentlyContinue) {
  $ping = & redis-cli ping 2>$null
  if ($ping -ne 'PONG') {
    Start-Process redis-server -WindowStyle Hidden -PassThru 2>$null
    Write-Host "Redis started." -ForegroundColor Green
  } else {
    Write-Host "Redis already running." -ForegroundColor Green
  }
} else {
  Write-Warning "Redis not found. Task queues (巡店/绑定/写操作) will not work."
  Write-Warning "Run: winget install Redis.Redis"
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
