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
Require-Command "pnpm" "Install pnpm with: corepack enable"

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
  if (Get-Command "docker" -ErrorAction SilentlyContinue) {
    Run-Step "Start Redis with Docker Compose" {
      docker compose up -d redis
    }
  } else {
    Write-Warning "Docker is not installed. Make sure Redis is running and .env points to it."
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
