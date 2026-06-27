# Script syntax & logic self-test
# Usage: .\scripts\test-scripts.ps1
param([switch]$Fix)

$ErrorActionPreference = "Continue"
$failed = 0
$passed = 0

function Test-Syntax {
  param([string]$Path, [string]$Label)
  $errors = @()
  $tokens = @()
  $ast = [System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path $Path).Path, [ref]$tokens, [ref]$errors
  )
  if ($errors.Count -gt 0) {
    Write-Host "  FAIL $Label" -ForegroundColor Red
    foreach ($e in $errors) {
      Write-Host "    Line $($e.Extent.StartLineNumber): $($e.Message)" -ForegroundColor Red
    }
    $script:failed++
  } else {
    Write-Host "  PASS $Label" -ForegroundColor Green
    $script:passed++
  }
}

function Test-Contains {
  param([string]$Path, [string]$Label, [string[]]$Patterns)
  $content = Get-Content $Path -Raw
  $missing = @()
  foreach ($p in $Patterns) {
    if ($content -notmatch [regex]::Escape($p)) {
      $missing += $p
    }
  }
  if ($missing.Count -gt 0) {
    Write-Host "  FAIL $Label — missing: $($missing -join ', ')" -ForegroundColor Red
    $script:failed++
  } else {
    Write-Host "  PASS $Label" -ForegroundColor Green
    $script:passed++
  }
}

Write-Host "=== PDD Script Self-Test ===" -ForegroundColor Cyan
Write-Host ""

# ---- Syntax checks ----
Write-Host "[Syntax]" -ForegroundColor Yellow
Test-Syntax "$PSScriptRoot\deploy-windows.ps1" "deploy-windows.ps1"
Test-Syntax "$PSScriptRoot\start-windows.ps1"  "start-windows.ps1"

# ---- Function completeness ----
Write-Host ""
Write-Host "[Functions]" -ForegroundColor Yellow
Test-Contains "$PSScriptRoot\deploy-windows.ps1" "has Require-Command" @("function Require-Command")
Test-Contains "$PSScriptRoot\deploy-windows.ps1" "has Run-Step" @("function Run-Step")
Test-Contains "$PSScriptRoot\start-windows.ps1"  "has Start-AppProcess" @("function Start-AppProcess")

# ---- Key features present ----
Write-Host ""
Write-Host "[Features]" -ForegroundColor Yellow
Test-Contains "$PSScriptRoot\deploy-windows.ps1" "docker attempt" @("docker compose up -d redis")
Test-Contains "$PSScriptRoot\deploy-windows.ps1" "pnpm auto-install" @("npm install -g pnpm")
Test-Contains "$PSScriptRoot\deploy-windows.ps1" "db migrate" @("pnpm db:migrate")
Test-Contains "$PSScriptRoot\deploy-windows.ps1" "pnpm build" @("pnpm build")
Test-Contains "$PSScriptRoot\start-windows.ps1"  "redis startup" @("docker compose up -d redis")
Test-Contains "$PSScriptRoot\start-windows.ps1"  "server start" @("pnpm --filter @pdd-inspector/server")
Test-Contains "$PSScriptRoot\start-windows.ps1"  "worker start" @("pnpm --filter @pdd-inspector/worker")

# ---- Scenario: deploy requires Redis or user choice ----
$deploy = Get-Content "$PSScriptRoot\deploy-windows.ps1" -Raw
if ($deploy -match '-SkipRedis') {
  Write-Host "  PASS -SkipRedis supported" -ForegroundColor Green
  $passed++
} else {
  Write-Host "  FAIL -SkipRedis missing" -ForegroundColor Red
  $failed++
}
if ($deploy -match 'winget install Redis') {
  Write-Host "  PASS Redis install option present" -ForegroundColor Green
  $passed++
} else {
  Write-Host "  FAIL Redis install option missing" -ForegroundColor Red
  $failed++
}
if ($deploy -match 'Docker Desktop' -and $deploy -match 'winget install') {
  Write-Host "  PASS Docker install instructions present" -ForegroundColor Green
  $passed++
} else {
  Write-Host "  FAIL Docker install instructions missing" -ForegroundColor Red
  $failed++
}

# ---- Runtime: docker detection does not hang ----
Write-Host ""
Write-Host "[Runtime]" -ForegroundColor Yellow
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$job = Start-Job -ScriptBlock {
  docker compose up -d redis 2>$null
  exit $LASTEXITCODE
}
$null = Wait-Job $job -Timeout 5
$exitCode = (Receive-Job $job -ErrorAction SilentlyContinue)
Remove-Job $job -Force
$sw.Stop()

if ($sw.Elapsed.TotalSeconds -lt 4.5) {
  Write-Host "  PASS docker detection completes in $([math]::Round($sw.Elapsed.TotalSeconds, 1))s" -ForegroundColor Green
  $passed++
} else {
  Write-Host "  FAIL docker detection hung or timed out" -ForegroundColor Red
  $failed++
}

$ErrorActionPreference = $prevEAP

Write-Host ""
Write-Host "=== Result: $passed passed, $failed failed ===" -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Red' })
if ($failed -gt 0) { exit 1 }
