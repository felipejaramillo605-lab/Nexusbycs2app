param([string]$RepoRoot = (Get-Location))
$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $RepoRoot ".nexus-owner-billing-patch-backups\$stamp"
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$files = @('backend/server.py','backend/owner_billing_hub.py','frontend/src/pages/OwnerOrganizationOnboarding.jsx')
foreach ($rel in $files) {
  $src = Join-Path $RepoRoot $rel; $dst = Join-Path $backup $rel
  New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
  Copy-Item -LiteralPath $src -Destination $dst
}
@{repo_root=$RepoRoot; created_at=(Get-Date).ToString('o'); files=$files} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backup 'backup-manifest.json') -Encoding UTF8
Write-Host "Backup creado: $backup"

