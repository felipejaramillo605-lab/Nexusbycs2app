# Nexus by CS2

Nexus es una plataforma SaaS multitenant para barberias y salones. Centraliza agenda, clientes, profesionales, servicios, ingresos, comisiones, liquidaciones, inventario, proveedores, compras y suscripciones.

## Estado actual

- Preview obligatorio antes de produccion.
- Aislamiento multitenant validado para lecturas, escrituras e IDs internos.
- CORS con allowlist explicita, proteccion de Origin y rate limiting de autenticacion.
- CSP sin scripts inline y headers web endurecidos.
- SMTP live, scheduler y enforcement de suscripcion permanecen desactivados hasta QA explicita.

## Estructura

- `backend/`: API FastAPI y logica de negocio.
- `frontend/`: interfaz React.
- `scripts/`: automatizaciones permanentes.
- `tests/` y `test_reports/`: pruebas y evidencias.
- `docs/`: documentacion operativa vigente.
- `design_guidelines.json`: lineamientos visuales.

## Documentacion

- [Seguridad y autenticacion](docs/AUTH_SECURITY_TESTING.md)
- [Despliegue y dominios](docs/DEPLOYMENT_AND_DOMAINS.md)
- [Correo y facturacion](docs/EMAIL_AND_BILLING_OPERATIONS.md)
- [Diagnostico operativo](docs/TROUBLESHOOTING.md)

## Reglas

1. Backup branch antes de cambios sensibles.
2. Commits atomicos.
3. Validar compilacion, runtime, tenant isolation y `git diff --check`.
4. No guardar secretos, tokens, passwords ni `.env` en Git.
5. Eliminar installers, exports y diagnostics temporales al cerrar cada bloque.
