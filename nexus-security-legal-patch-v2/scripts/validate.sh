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
echo "  1. Portal de Cliente: iniciar sesión con PIN -> Configuración/Mi Portal -> personalización visible."
echo "  2. Reserva como invitado (/book/{org_id}): debe verse el checkbox de marketing + link a Política de Privacidad."
echo "  3. Registro de nuevo owner/manager (/register): el botón 'Crear Cuenta' debe estar deshabilitado hasta marcar ToS."
echo "  4. Abrir /terms-of-service y /privacy-policy -> deben cargar sin errores."
echo "  5. Intentar llamar GET /api/public/clients/my-data SIN estar logueado como cliente -> debe responder 401."
echo "  6. Como cliente logueado (PIN), probar que SÍ puede ver/editar/eliminar SU PROPIO registro vía el flujo normal de la app."
echo "  7. Revisar que /book/{org_id} y el historial de citas por teléfono (invitado) siguen funcionando (rate-limited, no rotos)."

if [ -d "$REPO_ROOT/frontend" ] && [ -f "$REPO_ROOT/frontend/package.json" ]; then
  echo ""
  echo "Si quieres validar el build de frontend (puede tardar varios minutos):"
  echo "  cd $REPO_ROOT/frontend && npm run build"
fi
