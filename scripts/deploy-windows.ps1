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
  $dockerAvailable = Get-Command "docker" -ErrorAction SilentlyContinue

  # Strategy 1: Docker Compose (if available)
  if ($dockerAvailable) {
    try {
      docker compose up -d redis 2>$null
      $redisStarted = $true
      Write-Host "Redis started via Docker Compose." -ForegroundColor Green
    } catch {
      Write-Host ""
      Write-Warning "Docker Compose 启动失败。"
      Write-Host ""
      Write-Host "  请确认:"
      Write-Host "    1. Docker Desktop 是否已打开并完成初始化"
      Write-Host "    2. 右下角 Docker 图标是否为绿色运行状态"
      Write-Host ""
      throw "Docker is installed but not running. Please start Docker Desktop and retry."
    }
  } else {
    # No Docker — give clear instructions, do NOT continue
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Red
    Write-Host "  Redis 未安装。Redis 是系统运行必需的组件。" -ForegroundColor Red
    Write-Host "============================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "  请选择一种安装方式:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  [1] Docker Desktop (推荐，跨平台)"
    Write-Host "      winget install Docker.DockerDesktop"
    Write-Host "      (安装后重启电脑，打开 Docker Desktop)"
    Write-Host ""
    Write-Host "  [2] 原生 Redis (最快，无需重启)"
    Write-Host "      winget install Redis.Redis"
    Write-Host ""
    Write-Host "  [3] 跳过安装，手动启动 Redis"
    Write-Host "      .\scripts\deploy-windows.ps1 -SkipRedis"
    Write-Host ""
    $choice = Read-Host "  输入 1 / 2 / 3"
    if ($choice -eq '2') {
      if (Get-Command "winget" -ErrorAction SilentlyContinue) {
        Write-Host "Installing Redis via winget..." -ForegroundColor Yellow
        winget install Redis.Redis --accept-package-agreements --silent 2>$null
        if (Get-Command "redis-cli" -ErrorAction SilentlyContinue) {
          Start-Process redis-server -WindowStyle Hidden -PassThru 2>$null
          $redisStarted = $true
          Write-Host "Redis installed and started." -ForegroundColor Green
        } else {
          throw "Redis installation failed. Please install manually: winget install Redis.Redis"
        }
      } else {
        throw "winget not available. Please install Redis manually: https://github.com/tporadowski/redis/releases"
      }
    } elseif ($choice -eq '3') {
      throw "Deploy aborted. Run again with: .\scripts\deploy-windows.ps1 -SkipRedis"
    } else {
      $msg = @"
Deploy aborted. Please install Docker Desktop:
  winget install Docker.DockerDesktop
  (restart your PC, then open Docker Desktop)
"@
      throw $msg
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
