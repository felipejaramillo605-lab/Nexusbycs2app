# Despliegue y dominios

## Preview

`FRONTEND_URL` define el frontend vigente. La misma origin debe estar en `CORS_ORIGINS`, sin wildcard, rutas ni slash final.

## Validacion antes de desplegar

1. `git diff --check`.
2. Compilacion backend y build frontend.
3. Runtime tests y matriz multitenant.
4. Headers HTTP y CORS preflight.
5. QA visual en Preview.
6. Commit atomico y backup posterior.

## Estado seguro

SMTP live, scheduler, enforcement y backfills globales automaticos permanecen desactivados hasta QA especifica.

Antes de produccion se deben configurar dominio, DNS y TLS definitivos y repetir las pruebas con la origin final.
