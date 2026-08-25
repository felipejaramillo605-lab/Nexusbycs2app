#!/bin/bash
set -e

REPO_ROOT="${1:-.}"
BACKUP_PATH="${2}"

if [ -z "$BACKUP_PATH" ]; then
  echo "ERROR: Se requiere el parámetro BACKUP_PATH"
  echo "Uso: $0 <repo_root> <backup_path>"
  exit 1
fi

REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
BACKUP_PATH="$(cd "$BACKUP_PATH" && pwd)"

modified_files=(
  "PRIVACY_POLICY.md"
  "backend/server.py"
  "frontend/public/PRIVACY_POLICY.md"
  "frontend/src/App.js"
  "frontend/src/components/ClientPortalNav.js"
  "frontend/src/components/ClientPortalThemeWrapper.js"
  "frontend/src/components/design/AdminShell.jsx"
  "frontend/src/constants/clientPortalThemes.js"
  "frontend/src/index.css"
  "frontend/src/pages/BookingFlow.js"
  "frontend/src/pages/PrivacyPolicy.js"
  "frontend/src/pages/Register.js"
  "frontend/src/pages/Settings.js"
)

new_files=(
  "frontend/src/components/PortalCustomizationPanel.jsx"
  "frontend/src/components/onboarding/onboardingSteps.js"
  "frontend/src/components/onboarding/onboardingIllustrations.jsx"
  "frontend/src/components/onboarding/OnboardingTour.jsx"
  "frontend/src/pages/TermsOfService.js"
  "scripts/validate-before-push.ps1"
)

for rel in "${modified_files[@]}"; do
  src="$BACKUP_PATH/$rel"
  if [ ! -f "$src" ]; then
    echo "ERROR: No se encontró backup para $rel en $BACKUP_PATH"
    exit 1
  fi
  cp "$src" "$REPO_ROOT/$rel"
done

echo "Archivos modificados restaurados desde: $BACKUP_PATH"
echo ""
echo "Los siguientes archivos NUEVOS no se eliminan automáticamente (por seguridad)."
echo "Si quieres eliminarlos manualmente:"
for rel in "${new_files[@]}"; do
  echo "  rm \"$REPO_ROOT/$rel\""
done
