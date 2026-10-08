# RESUMEN EJECUTIVO — Auditoría Nexus by CS2 (FASES 1-5)

**Fecha:** 2026-08-11. **Entorno:** Preview (`https://clipper-manage-1.preview.emergentagent.com`). Ningún despliegue, reinicio de servicios ni cambio de configuración de producción. Ningún valor de secreto fue mostrado. `org_demo001` no fue modificada (salvo el backfill idempotente de seed documentado en FASE 1).

## 10 hallazgos más importantes

| # | Hallazgo | Fase | Severidad | Estado |
|---|---|---|---|---|
| 1 | `message-templates` (marketing) no bloqueaba organizaciones de EE. UU. — violaba la política "US sin campañas" que sí aplican payroll/HR | 4 | **ALTA** | **Corregido** — commit `4752af1` en `emergent/fase4-e2e`, con prueba |
| 2 | `NameError` latente (`profile_for` no importado) en el envío de confirmación de cita por WhatsApp cuando el cliente tiene consentimiento — hubiera dado error 500 en una org Premium real | 4 | **ALTA** | **Corregido** — mismo commit `4752af1` |
| 3 | `seed_data.py` caía en silencio en una base de datos equivocada (`barbershop`) cuando faltaba `DB_NAME`, a diferencia de todos los demás scripts del backend | 1 | ALTA | **Corregido** — commit `20dec72` en `emergent/fase1-suite`, con prueba |
| 4 | Una prueba (`test_media_mirror.py`) subió sin querer un archivo de 15 MB de basura al bucket real de Cloudflare R2 (`nexus-media`) porque las credenciales de R2 ya son reales; ocurrió de nuevo en una corrida posterior | 1, 4 | MEDIA | Detectado y **limpiado dos veces** (bucket queda vacío de ese objeto). Prueba obsoleta, dejada intacta por instrucción explícita del usuario. **Riesgo abierto:** cualquier corrida futura de la suite completa puede repetir esta subida real. |
| 5 | Falta índice `{organization_id, phone}` en `clients` — la búsqueda de cliente por teléfono en cada reserva pública hace un escaneo de todos los clientes de la organización (invisible hoy con ≤25 clientes/org, relevante a escala) | 5 | MEDIA | Propuesta sin ejecutar: `ops/propuestas/indices_2026-08-11.py` |
| 6 | El agente de pruebas de FASE 4 reportó limpieza 100% completa de datos `E2E_` y dejó 1 usuario residual (`E2E_mgr_E2E_Standard_CO_*`) sin organización | 4→5 | BAJA | **Corregido** en FASE 5 tras verificación independiente |
| 7 | Una corrida fallida de `test_loyalty_and_calendar.py` dejó 3 clientes de prueba (`loyalty_test@example.com`) en `org_demo001` | 1→5 | BAJA | **Corregido** en FASE 5 |
| 8 | No existe instrumentación de latencia (tiempo de respuesta) en el backend; no se pudo auditar "respuestas > 1s" como pedía la FASE 2 porque el dato no existe | 2 | MEDIA (brecha de observabilidad) | Documentado, sin cambio de código (fuera del alcance de una auditoría de solo lectura) |
| 9 | `webhook-crond` (infraestructura propia de la plataforma Emergent, no del código de la app) falla cada minuto intentando instalar un demonio cron inexistente en la imagen | 2 | BAJA | Informativo — no es código de la app, los 3 demonios reales de Nexus corren bien vía supervisor |
| 10 | Variables de entorno con default interno no declaradas explícitamente en `.env` (`COOKIE_SECURE`, `WHATSAPP_API_VERSION`, etc.) — ningún riesgo detectado, solo falta de trazabilidad | 3 | BAJA | Documentado, sin acción |

## Qué requiere acción inmediata de Felipe
- **Ninguno de los hallazgos ALTA quedó pendiente** — ambos ya están corregidos y con prueba en sus ramas respectivas.
- **Decisión pendiente (hallazgo #4):** si el equipo quiere evitar que pruebas futuras escriban basura real en el bucket R2 de producción, conviene usar un `R2_BUCKET` separado para tests/CI, o aceptar el riesgo y seguir limpiando manualmente. No se tocó nada de esto por instrucción explícita.
- **Decisión pendiente (hallazgo #5):** aprobar o no la ejecución de `ops/propuestas/indices_2026-08-11.py` (no destructivo, solo crea un índice).

## Ramas creadas (para "Guardar en GitHub")
| Rama | Contenido | ¿Recomendada para guardar? |
|---|---|---|
| `emergent/fase1-suite` | Fix de `seed_data.py` + prueba + informe | **Sí** — bug real corregido |
| `emergent/fase2-logs` | Solo informe (sin cambios de código) | Opcional — es solo documentación |
| `emergent/fase3-config` | Solo informe (sin cambios de código) | Opcional — es solo documentación |
| `emergent/fase4-e2e` | Fix de seguridad (US marketing) + fix de `NameError` + pruebas + informe | **Sí, prioritaria** — 2 bugs reales corregidos |
| `emergent/fase5-db-health` | Informe + script de índice propuesto (no ejecutado) | **Sí** — útil como referencia, el script no se aplica hasta que Felipe/Claude lo aprueben |

## Créditos usados por fase (estimado cualitativo, no hay medición exacta disponible)
- FASE 1: alto — correr la suite completa 3 veces para aislar la causa raíz del entorno, más `yarn build`.
- FASE 2: bajo — solo lectura de logs ya existentes.
- FASE 3: bajo — solo grep/comparación de nombres de variables.
- FASE 4: **el más alto** — 2 corridas del agente de pruebas (la primera no cumplió el alcance y se repitió), creación/borrado real de 4 organizaciones, navegador real.
- FASE 5: medio — varias consultas de diagnóstico + `explain()`, más limpieza de los residuos detectados.

## Fases pendientes
FASE 6 (recordatorios/outbox con tiempo simulado), FASE 7 (preparación de migración fuera de Emergent), FASE 8 (rendimiento con volumen), FASE 9 (móvil y accesibilidad) — **no iniciadas**, a la espera de luz verde según lo indicado.

---
Felipe: las ramas `emergent/fase1-suite` y `emergent/fase4-e2e` contienen correcciones de bugs reales (una de seguridad/cumplimiento) — te recomiendo guardarlas en GitHub con "Guardar en GitHub" cuando Claude las revise por PR. Las de FASE 2, 3 y 5 son solo informes/documentación y una propuesta de índice sin aplicar; guárdalas si quieres tener el rastro, pero no son urgentes. Qué decidir: (a) si aprobar la ejecución del índice propuesto en FASE 5, y (b) si quieres un bucket R2 separado para pruebas antes de que yo continúe con fases que vuelvan a correr la suite completa.
