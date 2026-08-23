param([string]$RepoRoot = (Get-Location))
$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$required = @('backend/server.py','backend/owner_billing_hub.py','frontend/src/pages/OwnerOrganizationOnboarding.jsx')
foreach ($rel in $required) { if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $rel) -PathType Leaf)) { throw "Falta archivo requerido: $rel" } }
if (-not (Test-Path (Join-Path $RepoRoot '.git'))) { Write-Warning 'No se detectó .git; se continuará con validación por hash.' }
if (Get-Command git -ErrorAction SilentlyContinue) { git -C $RepoRoot status --short }
Write-Host "Prerequisitos OK: $RepoRoot"

