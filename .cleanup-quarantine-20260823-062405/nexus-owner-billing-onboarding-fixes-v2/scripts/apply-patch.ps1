param([string]$RepoRoot = (Get-Location), [switch]$SkipBackup)
$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$bundle = Split-Path -Parent $PSScriptRoot; $base = Join-Path $bundle 'base'; $source = Join-Path $bundle 'source'
$files = @('backend/server.py','backend/owner_billing_hub.py','frontend/src/pages/OwnerOrganizationOnboarding.jsx')
if (-not $SkipBackup) { & (Join-Path $PSScriptRoot 'backup.ps1') -RepoRoot $RepoRoot }
foreach ($rel in $files) {
  $current = Join-Path $RepoRoot $rel; $expected = Join-Path $base $rel
  if ((Get-FileHash -LiteralPath $current -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $expected -Algorithm SHA256).Hash) { throw "Contexto no coincide para $rel. No se modificó ningún archivo." }
}
foreach ($rel in $files) { Copy-Item -LiteralPath (Join-Path $source $rel) -Destination (Join-Path $RepoRoot $rel) -Force }
Write-Host "Aplicación completada: snapshots verificados y copiados."
