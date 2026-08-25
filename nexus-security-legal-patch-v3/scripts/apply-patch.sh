#!/bin/bash
set -e

REPO_ROOT="${1:-.}"
SKIP_BACKUP="${2:-false}"

REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE="$(dirname "$SCRIPT_DIR")"
BASE="$BUNDLE/base"
SOURCE="$BUNDLE/source"
NEWFILES="$BUNDLE/newfiles"

# Files that already exist and get modified (hash-verified before touching, CRLF-normalized)
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
  "frontend/src/components/PortalCustomizationPanel.jsx"
  "frontend/src/components/onboarding/onboardingSteps.js"
  "frontend/src/components/onboarding/onboardingIllustrations.jsx"
  "frontend/src/components/onboarding/OnboardingTour.jsx"
)

# Brand new files added by this package (must NOT already exist)
new_files=(
  "frontend/src/pages/TermsOfService.js"
  "scripts/validate-before-push.ps1"
)

if [ "$SKIP_BACKUP" != "true" ]; then
  bash "$SCRIPT_DIR/backup.sh" "$REPO_ROOT"
fi

echo "Verificando contexto de archivos a modificar (ignorando fin de línea CRLF/LF)..."
for rel in "${modified_files[@]}"; do
  current="$REPO_ROOT/$rel"
  expected="$BASE/$rel"

  if [ ! -f "$current" ]; then
    echo "ERROR: No existe $rel en el repo. ¿Ruta correcta?"
    exit 1
  fi

  current_hash=$(sed 's/\r$//' "$current" | sha256sum | awk '{print $1}')
  expected_hash=$(sha256sum "$expected" | awk '{print $1}')

  if [ "$current_hash" != "$expected_hash" ]; then
    echo "ERROR: Contexto no coincide para $rel."
    echo "  Esperado: $expected_hash"
    echo "  Actual:   $current_hash"
    echo "No se modificó ningún archivo."
    echo ""
    echo "Esto normalmente significa que el código en Emergent cambió desde que se generó este paquete."
    echo "No fuerces la aplicación — avisa para regenerar el paquete contra el código actual."
    exit 1
  fi
done

echo "Verificando que los archivos nuevos no existan ya..."
for rel in "${new_files[@]}"; do
  if [ -f "$REPO_ROOT/$rel" ]; then
    echo "ERROR: $rel ya existe en el repo. No se sobrescribe automáticamente."
    echo "Revisa manualmente si es un conflicto real antes de continuar."
    exit 1
  fi
done

echo "Contexto verificado. Aplicando cambios..."
for rel in "${modified_files[@]}"; do
  cp "$SOURCE/$rel" "$REPO_ROOT/$rel"
done
for rel in "${new_files[@]}"; do
  dst="$REPO_ROOT/$rel"
  mkdir -p "$(dirname "$dst")"
  cp "$NEWFILES/$rel" "$dst"
done

echo "Aplicación completada: ${#modified_files[@]} archivos modificados, ${#new_files[@]} archivos nuevos creados."
