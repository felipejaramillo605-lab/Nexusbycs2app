#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Validate backend + frontend before pushing to Emergent.

.DESCRIPTION
  Runs syntax checks (Python) and build validation (npm) to prevent broken deployments.
  Exit code 0 = safe to push, non-zero = failures found.

.EXAMPLE
  .\scripts\validate-before-push.ps1
#>

$ErrorActionPreference = "Stop"

$REPO_ROOT = if ($PSScriptRoot) { $PSScriptRoot | Split-Path -Parent } else { Get-Location }
$REPO_ROOT = (Resolve-Path $REPO_ROOT).Path

Write-Host "=== Nexus Pre-Push Validation ===" -ForegroundColor Cyan
Write-Host "Repo: $REPO_ROOT" -ForegroundColor Gray
Write-Host ""

$failed = $false

# --- Backend: Python syntax check ---
Write-Host "[1/2] Backend validation (Python)..." -ForegroundColor Yellow

$backend_file = "$REPO_ROOT\backend\server.py"
if (-not (Test-Path $backend_file)) {
  Write-Host "  ❌ NOT FOUND: $backend_file" -ForegroundColor Red
  $failed = $true
} else {
  try {
    python -m py_compile $backend_file 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    Write-Host "  ✅ Python syntax OK" -ForegroundColor Green
  } catch {
    Write-Host "  ❌ Syntax error in $backend_file" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
    $failed = $true
  }
}

Write-Host ""

# --- Frontend: npm build ---
Write-Host "[2/2] Frontend validation (npm build)..." -ForegroundColor Yellow

$frontend_dir = "$REPO_ROOT\frontend"
$build_dir = "$frontend_dir\build"

if (-not (Test-Path $frontend_dir)) {
  Write-Host "  ❌ NOT FOUND: $frontend_dir" -ForegroundColor Red
  $failed = $true
} else {
  # Remove old build folder
  if (Test-Path $build_dir) {
    Remove-Item -Recurse -Force $build_dir
  }

  Push-Location $frontend_dir
  $prevPref = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  cmd /c "npm run build" *>$null
  $ErrorActionPreference = $prevPref
  Pop-Location

  # Check if build succeeded by verifying build folder exists and has content
  if ((Test-Path $build_dir) -and (Get-ChildItem $build_dir -Recurse | Measure-Object).Count -gt 0) {
    Write-Host "  ✅ Frontend build OK" -ForegroundColor Green
  } else {
    Write-Host "  ❌ Build failed" -ForegroundColor Red
    Write-Host "  Run manually: cd $frontend_dir && npm run build" -ForegroundColor Yellow
    $failed = $true
  }
}

Write-Host ""

# --- Result ---
if ($failed) {
  Write-Host "❌ VALIDATION FAILED - Do NOT push yet" -ForegroundColor Red
  Write-Host "   Fix errors above and run validation again." -ForegroundColor Yellow
  exit 1
} else {
  Write-Host "✅ ALL CHECKS PASSED - Safe to push" -ForegroundColor Green
  exit 0
}
