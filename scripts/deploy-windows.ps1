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
  $redisStarted = $false

  # Strategy 1: Docker Compose (if available)
  if (Get-Command "docker" -ErrorAction SilentlyContinue) {
    try {
      docker compose up -d redis 2>$null
      $redisStarted = $true
      Write-Host "Redis started via Docker Compose." -ForegroundColor Green
    } catch {
      Write-Warning "Docker Compose failed, trying native Redis..."
    }
  }

  # Strategy 2: Native Redis already installed
  if (-not $redisStarted) {
    if (Get-Command "redis-cli" -ErrorAction SilentlyContinue) {
      $redisRunning = & redis-cli ping 2>$null
      if ($redisRunning -ne 'PONG') {
        $redisRunning = Start-Process redis-server -WindowStyle Hidden -PassThru 2>$null
      }
      $redisStarted = $true
      Write-Host "Using native Redis." -ForegroundColor Green
    }
  }

  # Strategy 3: Auto-install native Redis via winget
  if (-not $redisStarted) {
    if (Get-Command "winget" -ErrorAction SilentlyContinue) {
      Write-Host "Installing Redis via winget..." -ForegroundColor Yellow
      winget install Redis.Redis --accept-package-agreements --silent 2>$null
      if (Get-Command "redis-cli" -ErrorAction SilentlyContinue) {
        Start-Process redis-server -WindowStyle Hidden -PassThru 2>$null
        $redisStarted = $true
        Write-Host "Redis installed and started." -ForegroundColor Green
      }
    }
  }

  # Strategy 4: Auto-install via Chocolatey
  if (-not $redisStarted) {
    if (Get-Command "choco" -ErrorAction SilentlyContinue) {
      choco install redis-64 -y 2>$null
      if (Get-Command "redis-cli" -ErrorAction SilentlyContinue) {
        Start-Process redis-server -WindowStyle Hidden -PassThru 2>$null
        $redisStarted = $true
        Write-Host "Redis installed via Chocolatey." -ForegroundColor Green
      }
    }
  }

  if (-not $redisStarted) {
    Write-Warning @"

Redis is not available. Options:
  1. Install Docker Desktop: winget install Docker.DockerDesktop
  2. Install Redis directly:   winget install Redis.Redis
  3. Run deploy again with:    .\scripts\deploy-windows.ps1 -SkipRedis
     (then manually start Redis and configure .env)
"@
    throw "Redis is required. Please install Redis using one of the options above and retry."
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
