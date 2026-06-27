param(
  [switch]$SkipRedis,
  [switch]$SkipSeed
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Require-Command {
  param([string]$Name, [string]$InstallHint)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required. $InstallHint"
  }
}

function Run-Step {
  param([string]$Title, [scriptblock]$Command)
  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  & $Command
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

Write-Host "PDD Inspector Windows deploy" -ForegroundColor Green
Write-Host "Workspace: $Root"

Require-Command "node" "Install Node.js 20+ from https://nodejs.org/"

if (-not (Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
  Write-Host "pnpm not found, installing..."
  try {
    corepack enable 2>$null
    if (-not (Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
      npm install -g pnpm 2>$null
    }
  } catch {
    npm install -g pnpm
  }
  if (-not (Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
    throw "Failed to install pnpm. Please install manually: npm install -g pnpm"
  }
  Write-Host "pnpm installed successfully."
}

$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]") -as [string])
if ($nodeMajor -lt 20) {
  throw "Node.js 20+ is required. Current major version: $nodeMajor"
}

if (-not (Test-Path ".env")) {
  Run-Step "Create .env from .env.example" {
    Copy-Item ".env.example" ".env"
  }
} else {
  Write-Host ".env already exists, skip copying."
}

if (-not $SkipRedis) {
  $dockerAvailable = (Test-Path "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe") -or (Test-Path "${env:ProgramFiles(x86)}\Docker\Docker\resources\bin\docker.exe")

  if ($dockerAvailable) {
    try {
      docker compose up -d redis 2>$null
      Write-Host "Redis started via Docker Compose." -ForegroundColor Green
    } catch {
      Write-Warning "Docker Compose failed. Is Docker Desktop running (green icon)?"
      throw "Docker installed but not running. Start Docker Desktop and retry."
    }
  } else {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Red
    Write-Host "  Redis missing. Redis is required." -ForegroundColor Red
    Write-Host "============================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "  [1] Docker Desktop:   winget install Docker.DockerDesktop"
    Write-Host "  [2] Native Redis:     winget install Redis.Redis"
    Write-Host "  [3] Skip:             .\scripts\deploy-windows.ps1 -SkipRedis"
    Write-Host ""
    $choice = Read-Host "Enter 1, 2 or 3"

    if ($choice -eq "2") {
      if (Get-Command "winget" -ErrorAction SilentlyContinue) {
        winget install Redis.Redis --accept-package-agreements --silent 2>$null
        if (Get-Command "redis-cli" -ErrorAction SilentlyContinue) {
          Start-Process redis-server -WindowStyle Hidden -PassThru 2>$null
          Write-Host "Redis installed and started." -ForegroundColor Green
        } else {
          throw "Redis install failed. Try: winget install Redis.Redis"
        }
      } else {
        throw "winget not available. Install Redis from: https://github.com/tporadowski/redis/releases"
      }
    } elseif ($choice -eq "3") {
      throw "Deploy aborted. Retry with: .\scripts\deploy-windows.ps1 -SkipRedis"
    } else {
      throw "Deploy aborted. Install Docker: winget install Docker.DockerDesktop"
    }
  }
}

Run-Step "Install dependencies" {
  pnpm install
}

Run-Step "Run database migrations" {
  pnpm db:migrate
}

if (-not $SkipSeed) {
  Run-Step "Seed default data" {
    pnpm db:seed
  }
}

Run-Step "Build all packages" {
  pnpm build
}

Write-Host ""
Write-Host "Deploy finished." -ForegroundColor Green
Write-Host "Start server:  .\scripts\start-windows.ps1"
Write-Host "Open:          http://localhost:3000"
