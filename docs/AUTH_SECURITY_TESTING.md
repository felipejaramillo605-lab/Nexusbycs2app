# Seguridad y pruebas de autenticacion

## Controles vigentes

- El tenant de manager, admin y staff proviene de la sesion.
- `org_id` no autoriza acceso a otro tenant.
- Recursos ajenos responden `403` o `404`.
- CORS usa `CORS_ORIGINS` con allowlist explicita.
- Mutaciones autenticadas por cookie validan `Origin` y `Sec-Fetch-Site`.
- Rutas sensibles de autenticacion tienen rate limiting y `Retry-After`.
- La CSP bloquea scripts inline.

## QA minima

1. Login manual y OAuth, logout y revocacion.
2. Recuperacion y reset de password.
3. Usuarios pendientes, rechazados, inactivos y eliminados.
4. Manipulacion de `org_id` y de IDs internos ajenos.
5. Lecturas y escrituras cross-tenant.
6. Preflight CORS permitido y rechazado.
7. Operacion por cookie desde origen externo.
8. Rate limiting con datos sinteticos.
9. Consola sin errores CSP o CORS.

No imprimir tokens, cookies, passwords, PII ni secretos SMTP.
