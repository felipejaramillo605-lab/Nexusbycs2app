#!/bin/bash
set -e

REPO_ROOT="${1:-.}"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"

python_cmd=""
for cmd in python python3 py; do
  if command -v "$cmd" &>/dev/null; then
    python_cmd="$cmd"
    break
  fi
done

if [ -z "$python_cmd" ]; then
  echo "ADVERTENCIA: No se encontró Python. No se pudo validar backend/server.py."
else
  $python_cmd -m py_compile "$REPO_ROOT/backend/server.py"
  echo "Compilación Python OK: backend/server.py"
fi

echo ""
echo "Recuerda probar manualmente en preview antes de dar por bueno el deploy:"
echo "  1. GET /api/public/clients/my-data SIN sesión de cliente -> debe responder 401 (antes exponía datos)."
echo "  2. Portal de Cliente: iniciar sesión con PIN -> puedes ver/editar/eliminar TU PROPIO registro con normalidad."
echo "  3. Reserva como invitado (/book/{org_id}): checkbox de marketing + link a Política de Privacidad visibles."
echo "  4. /register: botón 'Crear Cuenta' deshabilitado hasta marcar el checkbox de Términos de Servicio."
echo "  5. Abrir /terms-of-service y /privacy-policy -> cargan sin errores, con las secciones nuevas."
echo "  6. Configuración -> 'Mi Portal': selector de tema + panel de personalización + 'Minimalista Morado' visibles."
echo "  7. Botones primarios/focus rings del dashboard admin se ven morados (revisar también en modo oscuro)."
echo "  8. Onboarding: borrar localStorage key 'nexus-onboarding-seen-<rol>' y volver a entrar -> debe aparecer el tour con acentos correctos (facturación, no facturacion)."

if [ -d "$REPO_ROOT/frontend" ] && [ -f "$REPO_ROOT/frontend/package.json" ]; then
  echo ""
  echo "Si quieres validar el build de frontend (puede tardar varios minutos):"
  echo "  cd $REPO_ROOT/frontend && npm run build"
fi
