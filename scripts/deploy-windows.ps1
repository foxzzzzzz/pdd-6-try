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
  $dockerAvailable = Get-Command "docker" -ErrorAction SilentlyContinue
  if ($dockerAvailable) {
    try {
      docker compose up -d redis 2>$null
      $redisStarted = $true
      Write-Host "Redis started via Docker Compose." -ForegroundColor Green
    } catch {
      Write-Host ""
      Write-Warning "Docker Compose failed. Redis is required for task queues."
      $choice = Read-Host "Switch to native Redis instead? [Y/n]"
      if ($choice -eq '' -or $choice -eq 'y' -or $choice -eq 'Y') {
        Write-Host "Switching to native Redis..." -ForegroundColor Yellow
      } else {
        throw "Deploy aborted. Please fix Docker and retry."
      }
    }
  }

  # Strategy 2: Native Redis already installed
  if (-not $redisStarted) {
    if (Get-Command "redis-cli" -ErrorAction SilentlyContinue) {
      $redisRunning = & redis-cli ping 2>$null
      if ($redisRunning -ne 'PONG') {
        Start-Process redis-server -WindowStyle Hidden -PassThru 2>$null
      }
      $redisStarted = $true
      Write-Host "Using native Redis." -ForegroundColor Green
    }
  }

  # Strategy 3: No Docker + prompt user to choose
  if (-not $redisStarted -and -not $dockerAvailable) {
    Write-Host ""
    Write-Host "Redis is required. Choose an option:" -ForegroundColor Yellow
    Write-Host "  [1] Install native Redis via winget (fast, no reboot)"
    Write-Host "  [2] Skip Redis for now (run again with -SkipRedis)"
    $choice = Read-Host "Enter 1 or 2"
    if ($choice -eq '1') {
      if (Get-Command "winget" -ErrorAction SilentlyContinue) {
        Write-Host "Installing Redis via winget..." -ForegroundColor Yellow
        winget install Redis.Redis --accept-package-agreements --silent 2>$null
        if (Get-Command "redis-cli" -ErrorAction SilentlyContinue) {
          Start-Process redis-server -WindowStyle Hidden -PassThru 2>$null
          $redisStarted = $true
          Write-Host "Redis installed and started." -ForegroundColor Green
        }
      } elseif (Get-Command "choco" -ErrorAction SilentlyContinue) {
        choco install redis-64 -y 2>$null
        if (Get-Command "redis-cli" -ErrorAction SilentlyContinue) {
          Start-Process redis-server -WindowStyle Hidden -PassThru 2>$null
          $redisStarted = $true
          Write-Host "Redis installed via Chocolatey." -ForegroundColor Green
        }
      } else {
        throw "Cannot auto-install Redis. Please install manually: winget install Redis.Redis"
      }
    } else {
      throw "Deploy aborted. Run again with: .\scripts\deploy-windows.ps1 -SkipRedis"
    }
  }

  # Strategy 4: Docker failed + user agreed to native Redis → install
  if (-not $redisStarted) {
    if (Get-Command "redis-cli" -ErrorAction SilentlyContinue) {
      Start-Process redis-server -WindowStyle Hidden -PassThru 2>$null
      $redisStarted = $true
      Write-Host "Using native Redis." -ForegroundColor Green
    } elseif (Get-Command "winget" -ErrorAction SilentlyContinue) {
      Write-Host "Installing Redis via winget..." -ForegroundColor Yellow
      winget install Redis.Redis --accept-package-agreements --silent 2>$null
      if (Get-Command "redis-cli" -ErrorAction SilentlyContinue) {
        Start-Process redis-server -WindowStyle Hidden -PassThru 2>$null
        $redisStarted = $true
        Write-Host "Redis installed and started." -ForegroundColor Green
      }
    }

    if (-not $redisStarted) {
      throw "Failed to start Redis. Please install manually and retry."
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
