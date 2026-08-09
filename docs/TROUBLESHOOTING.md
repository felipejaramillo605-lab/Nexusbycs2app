# Diagnostico operativo

## Orden de revision

1. `supervisorctl status backend frontend mongodb`.
2. Logs del servicio.
3. `git status --short` y `git diff --check`.
4. Compilacion o build.
5. OpenAPI y runtime tests.
6. Network y Console del navegador.

## Errores comunes

- `403`: revisar sesion, rol, tenant y Origin.
- `404`: puede ocultar deliberadamente un recurso ajeno.
- `429`: respetar `Retry-After`.
- CORS: comprobar la origin exacta en `CORS_ORIGINS`.
- CSP: no reintroducir `unsafe-inline` para scripts.

Al cerrar un bloque, eliminar installers, context exports, runners temporales, diagnostics y `__pycache__`.
