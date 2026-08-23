param([string]$RepoRoot = (Get-Location))
$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$bundle = Split-Path -Parent $PSScriptRoot; $base = Join-Path $bundle 'base'; $source = Join-Path $bundle 'source'
$files = @('backend/server.py','backend/owner_billing_hub.py','frontend/src/pages/OwnerOrganizationOnboarding.jsx')
foreach ($rel in $files) {
  $current = Join-Path $RepoRoot $rel; $snapshot = Join-Path $source $rel; $expected = Join-Path $base $rel
  $a = (Get-FileHash -LiteralPath $current -Algorithm SHA256).Hash
  $b = (Get-FileHash -LiteralPath $snapshot -Algorithm SHA256).Hash
  $baseHash = (Get-FileHash -LiteralPath $expected -Algorithm SHA256).Hash
  Write-Host "$rel"; Write-Host "  repo: $a"; Write-Host "  base: $baseHash"; Write-Host "  destino: $b"
  Compare-Object (Get-Content -LiteralPath $expected) (Get-Content -LiteralPath $snapshot) -SyncWindow 3 | Select-Object -First 30
}
