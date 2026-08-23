param([string]$RepoRoot = (Get-Location))
$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) { $python = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $python) { throw 'No se encontró Python (python o py).' }
& $python -m py_compile (Join-Path $RepoRoot 'backend/server.py') (Join-Path $RepoRoot 'backend/owner_billing_hub.py')
$frontend = Join-Path $RepoRoot 'frontend'
if (Test-Path (Join-Path $frontend 'package.json')) {
  Push-Location $frontend
  try { npm run build; if ((Get-Content package.json -Raw) -match '"lint"\s*:') { npm run lint } } finally { Pop-Location }
} else { Write-Warning 'No existe frontend/package.json; se omiten build/lint.' }
Write-Host 'Validaciones completadas.'
