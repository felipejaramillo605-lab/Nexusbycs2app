# RESUMEN EJECUTIVO — Auditoría Nexus by CS2 (FASES 1-8)

**Fecha:** 2026-08-11. **Entorno:** Preview. Ningún despliegue, reinicio de servicios ni cambio de configuración de producción en ninguna fase. Ningún valor de secreto fue mostrado. `org_demo001` no fue modificada (salvo el backfill idempotente de seed de FASE 1).

> Nota: mientras se ejecutaban estas fases, `main` avanzó por PRs externas (revisadas por Claude) que ya incorporaron los fixes de FASE 1 (`seed_data.py`), FASE 4 (bloqueo de `message-templates` en US + `NameError` de `profile_for`) y FASE 5 (índice de teléfono en `clients`), además de 2 mejoras no pedidas por mí pero derivadas de mis hallazgos (aislamiento de R2 en tests, logging de latencia) y 1 hallazgo de seguridad nuevo (AUD-01, organización pública). Las ramas `emergent/fase1-suite`, `emergent/fase4-e2e` y `emergent/fase5-db-health` quedaron efectivamente supersedidas por esos merges — se detalla abajo.

## 10 hallazgos más importantes (todas las fases)

| # | Hallazgo | Fase | Severidad | Estado |
|---|---|---|---|---|
| 1 | `message-templates` no bloqueaba organizaciones US (incumplía política "US sin marketing") | 4 | ALTA | **Corregido y ya en `main`** |
| 2 | `NameError` latente (`profile_for`) en confirmación de cita por WhatsApp | 4 | ALTA | **Corregido y ya en `main`** |
| 3 | `seed_data.py` caía en una base de datos equivocada en silencio | 1 | ALTA | **Corregido y ya en `main`** |
| 4 | `commission_totals()` (nómina) trae TODO el historial de liquidaciones sin filtrar en la consulta — el más lento de los 5 hot-paths medidos en FASE 8 (15.36 ms p50 vs 6.27 ms con el filtro en Mongo) | 8 | ALTA | **Diff propuesto, NO aplicado** (`emergent/fase8-rendimiento`) — pendiente de revisión |
| 5 | Fallo de WhatsApp inflaba el contador `failed` del ciclo de recordatorios aunque el correo ya estuviera aceptado | 6 | MEDIA | **Corregido** (`emergent/fase6-reminders-outbox`, aún no mergeado) |
| 6 | Falta índice `{organization_id, phone}` en `clients` | 5 | MEDIA | **Corregido y ya en `main`** |
| 7 | `/transactions/summary` (reporte de ventas) agrega en Python en vez de usar `$group` de Mongo | 8 | MEDIA | Documentado, sin diff aplicado — recomendación para el equipo |
| 8 | `GET /clients` y `GET /appointments` sin paginar son 8x y hasta 8x más lentos (365 días) que sus variantes paginadas/acotadas | 8 | MEDIA | Documentado, sin cambio de código |
| 9 | No hay instrumentación de latencia en el backend (FASE 2) | 2 | MEDIA | **Ya corregido en `main`** (fuera de mi alcance, vía PR externa) |
| 10 | Residuos de pruebas de la propia auditoría (usuario `E2E_` sin limpiar por el agente de pruebas, 3 clientes de una corrida fallida de pytest) en `org_demo001` | 1, 4, 5 | BAJA | **Corregidos** (limpiados manualmente en FASE 5) |

## Qué requiere acción inmediata de Felipe
- **Ninguno de los hallazgos ALTA está sin corrección propuesta.** El único pendiente de aplicar es el diff de `commission_totals()` (hallazgo #4) — no se aplicó a propósito, como pediste explícitamente para FASE 8 ("sin aplicar a producción").
- **Decisión pendiente:** aprobar (o no) los 2 diffs de FASE 8 (nómina ya redactado como diff completo; reporte de ventas solo descrito conceptualmente, falta que alguien escriba el pipeline `$group`).
- **FASE 6 y 7 aún no están en `main`** (a diferencia de FASE 1/4/5) — decide si quieres que Claude las revise por PR también.

## Ramas creadas (para "Guardar en GitHub")
| Rama | Contenido | Estado |
|---|---|---|
| `emergent/fase1-suite` | Fix `seed_data.py` | Ya incorporado a `main` por otra vía — rama redundante, se puede descartar |
| `emergent/fase2-logs` | Solo informe | Sin mergear, opcional |
| `emergent/fase3-config` | Solo informe | Sin mergear, opcional |
| `emergent/fase4-e2e` | 2 fixes de seguridad | Ya incorporado a `main` por otra vía — rama redundante, se puede descartar |
| `emergent/fase5-db-health` | Informe + índice propuesto | El índice ya se aplicó directamente en `main`; el informe sigue siendo útil, rama opcional |
| `emergent/fase6-reminders-outbox` | **Fix real** (métricas de recordatorios) + 4 pruebas con línea de tiempo | **Recomendado guardar/PR** — aún no está en `main` |
| `emergent/fase7-migracion` | Solo informe (runbook de migración) | Sin mergear, opcional |
| `emergent/fase8-rendimiento` | Solo informe (diffs propuestos, no aplicados) | Sin mergear, opcional |

## Resumen de las 3 fases nuevas (6, 7, 8)

**FASE 6 (recordatorios/outbox, reloj controlado):** encolado, entrega única, recuperación de reclamo expirado y reintento sin duplicar — todos verificados **sin pérdidas ni duplicados**. 1 bug real corregido (ver hallazgo #5).

**FASE 7 (preparación de migración):** `mongodump`/`mongorestore` probado (0.48 s dump / 8.37 s restore, 824 KB, 518/518 documentos verificados, base temporal borrada). El acoplamiento real a Emergent se reduce a 2 piezas: login social (`auth.emergentagent.com`) y la clave de IA (`EMERGENT_LLM_KEY`, ya agnóstica de proveedor vía `litellm`) — ambas con alternativa de esfuerzo bajo/medio. Todo lo demás (Mongo, R2, Resend/SMTP, WhatsApp, demonios) ya es portable sin cambios. Runbook de 7 pasos incluido en el informe.

**FASE 8 (rendimiento con volumen):** sembrados y luego borrados 10.000 clientes + 49.938 citas + 40.000 transacciones + 7.500 liquidaciones en 5 orgs `E2E_` (6.7 s de siembra). 5 cuellos de botella identificados con evidencia medida (p50/p95 + `explain()`); el más severo es la nómina del mes (hallazgo #4), con diff propuesto y medido (2.2-2.4x más rápido), sin aplicar a producción.

## Créditos usados por fase (estimado cualitativo)
FASE 6: medio (diseño de reloj controlado + 4 escenarios). FASE 7: bajo (dump/restore real pero rápido, más inventario de código). FASE 8: medio-alto (siembra de ~107k documentos, 2 scripts de benchmark, limpieza verificada).

## Fases pendientes
**FASE 9 (móvil y accesibilidad) — NO iniciada**, según tu instrucción explícita de detenerte en FASE 8.

---
Felipe: te recomiendo guardar en GitHub al menos `emergent/fase6-reminders-outbox` (tiene un fix real que todavía no está en `main`, a diferencia de FASE 1/4/5 que ya llegaron por otra vía). Las de FASE 2, 3, 7 y 8 son informes/documentación — gurdalas si quieres el rastro completo, no son urgentes. Qué decidir: (a) si quieres que alguien aplique el diff de nómina de FASE 8 (ya medido y redactado, falta aplicarlo y pasar por PR), y (b) si avanzamos a FASE 9 (móvil/accesibilidad) o nos quedamos aquí.
