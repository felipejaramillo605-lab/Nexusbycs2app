#!/bin/bash
set -e
REPO_ROOT="${1:-.}"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
files=(
  "backend/server.py"
  "frontend/src/constants/clientPortalThemes.js"
  "frontend/src/index.css"
  "frontend/src/pages/Settings.js"
  "frontend/src/components/ClientPortalNav.js"
  "frontend/src/components/design/AdminShell.jsx"
  "frontend/src/components/ClientPortalThemeWrapper.js"
)
stamp=$(date +%Y%m%d-%H%M%S)
backup_root="$REPO_ROOT/.nexus-portal-personalization-v1-backups/$stamp"
mkdir -p "$backup_root"
for rel in "${files[@]}"; do
  src="$REPO_ROOT/$rel"
  dst="$backup_root/$rel"
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
done
echo "Backup en: $backup_root"
