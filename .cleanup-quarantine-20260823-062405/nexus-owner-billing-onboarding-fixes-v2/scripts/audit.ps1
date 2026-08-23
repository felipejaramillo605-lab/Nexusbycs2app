param([string]$RepoRoot = (Get-Location))
$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$files = @('backend/server.py','backend/owner_billing_hub.py','frontend/src/pages/OwnerOrganizationOnboarding.jsx')
foreach ($rel in $files) { $p=Join-Path $RepoRoot $rel; if (-not (Test-Path $p)) { throw "Falta $rel" }; Write-Host "$rel $((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash)" }
if (Get-Command git -ErrorAction SilentlyContinue) { git -C $RepoRoot diff --check; git -C $RepoRoot diff --stat -- $files }
Write-Host 'Auditoría completada.'

