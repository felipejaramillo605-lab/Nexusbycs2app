#!/bin/bash
set -e

REPO_ROOT="${1:-.}"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="$REPO_ROOT/.patch-backups/nexus-security-legal-patch-v3-$TIMESTAMP"

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

mkdir -p "$BACKUP_DIR"
for rel in "${modified_files[@]}"; do
  src="$REPO_ROOT/$rel"
  if [ -f "$src" ]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    cp "$src" "$BACKUP_DIR/$rel"
  fi
done

echo "$BACKUP_DIR" > "$REPO_ROOT/.patch-backups/last-backup-path.txt"
echo "Backup creado en: $BACKUP_DIR"
