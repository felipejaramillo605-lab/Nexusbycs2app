#!/bin/bash
set -e
REPO_ROOT="${1:-.}"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE="$(dirname "$SCRIPT_DIR")"
BASE="$BUNDLE/base"
SOURCE="$BUNDLE/source"
NEWFILES="$BUNDLE/newfiles"
modified_files=(
  "backend/server.py"
  "frontend/src/constants/clientPortalThemes.js"
  "frontend/src/index.css"
  "frontend/src/pages/Settings.js"
  "frontend/src/components/ClientPortalNav.js"
  "frontend/src/components/design/AdminShell.jsx"
  "frontend/src/components/ClientPortalThemeWrapper.js"
)
new_files=(
  "frontend/src/components/PortalCustomizationPanel.jsx"
  "frontend/src/components/onboarding/onboardingIllustrations.jsx"
  "frontend/src/components/onboarding/onboardingSteps.js"
  "frontend/src/components/onboarding/OnboardingTour.jsx"
)
echo "Verificando..."
for rel in "${modified_files[@]}"; do
  current="$REPO_ROOT/$rel"
  expected="$BASE/$rel"
  if [ ! -f "$current" ] || [ ! -f "$expected" ]; then
    echo "ERROR: archivo no encontrado"
    exit 1
  fi
  current_hash=$(sha256sum "$current" | awk '{print $1}')
  expected_hash=$(sha256sum "$expected" | awk '{print $1}')
  if [ "$current_hash" != "$expected_hash" ]; then
    echo "ERROR: Hash mismatch en $rel"
    exit 1
  fi
done
echo "Aplicando cambios..."
for rel in "${modified_files[@]}"; do
  cp "$SOURCE/$rel" "$REPO_ROOT/$rel"
done
for rel in "${new_files[@]}"; do
  dst="$REPO_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"
  [ -f "$NEWFILES/$rel" ] && cp "$NEWFILES/$rel" "$dst"
done
echo "✅ Aplicado correctamente"
