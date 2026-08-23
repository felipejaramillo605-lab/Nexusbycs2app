param([string]$RepoRoot = (Get-Location), [Parameter(Mandatory=$true)][string]$BackupPath)
$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$BackupPath = (Resolve-Path -LiteralPath $BackupPath).Path
$files = @('backend/server.py','backend/owner_billing_hub.py','frontend/src/pages/OwnerOrganizationOnboarding.jsx')
$root = (Resolve-Path (Join-Path $RepoRoot '.')).Path
if (-not $BackupPath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw 'El backup debe estar dentro de la raíz del repositorio.' }
foreach ($rel in $files) { if (-not (Test-Path (Join-Path $BackupPath $rel))) { throw "Backup incompleto: $rel" } }
foreach ($rel in $files) { Copy-Item -LiteralPath (Join-Path $BackupPath $rel) -Destination (Join-Path $RepoRoot $rel) -Force }
Write-Host "Rollback completado desde $BackupPath"

