# FASE 6 — Recordatorios y outbox con tiempo simulado (Preview)

**Rama:** `emergent/fase6-reminders-outbox`. **Alcance:** solo funciones reales (`process_appointment_reminders`, `recover_expired_claims`, `enqueue_delivery`, `claim_delivery_by_key`) ejercitadas con un reloj controlado.

## Decisión de diseño de la prueba
En vez de crear una cita real en Mongo de Preview, se ejecutaron las funciones reales de `appointment_reminder_delivery.py`/`appointment_email_delivery.py` contra una base de datos **en memoria** (misma técnica que ya usa `test_class_confirmation_delivery.py` para el flujo de clases). Da exactamente la misma cobertura que pedía la tarea, con riesgo cero sobre `org_demo001` y sin depender de que el worker real recoja el ciclo en el minuto exacto. El reloj se controla así: `at` (parámetro de `process_appointment_reminders`) fija la fecha objetivo ("mañana"); un `now_utc()` mockeado (solo en el test, nunca en producción) controla las marcas de tiempo internas de la cola, que en el código real siempre usan la hora del sistema.

## Línea de tiempo observada

| Paso | Qué se hizo | Estado observado |
|---|---|---|
| Encolado + entrega única | 1er ciclo sobre una cita nueva | `eligible=1, accepted=1`; `appointments.reminder_sent=True`; 1 fila en `appointment_email_deliveries` con `status=provider_accepted` |
| Idempotencia (mismo ciclo 2 veces) | 2do ciclo inmediato, misma cita | `eligible=0` (ya no se vuelve a seleccionar); **0 filas nuevas** — sigue habiendo solo 1 |
| Reclamo expirado se recupera | Worker A reclama (`status=processing`) y "muere" sin responder; se avanza el reloj 301s (> lease de 300s) | `recover_expired_claims` → `recovered=1`, la fila pasa a `status=failed` con `next_attempt_at` futuro; el siguiente ciclo la reclama y la entrega (`accepted=1`), **sin duplicar fila** |
| Fallo del proveedor reintenta sin duplicar | 1er intento: `sender()` devuelve `False` | `failed=1`, fila `status=failed`, `next_attempt_at` > ahora, cita sigue elegible (`reminder_sent` no se marcó) | 
| | 2do intento, reloj avanzado hasta `next_attempt_at` | `accepted=1`, **misma fila** (`attempt_count=2`), ninguna fila nueva |
| WhatsApp falla, correo ya aceptado no se ve afectado | Org Premium CO con WhatsApp de recordatorio activo, cliente con consentimiento; `whatsapp_service.send_whatsapp_message` lanza excepción | Email: `accepted=1`, delivery `status=provider_accepted` (verificado, no se tocó) |

**Ningún duplicado ni pérdida detectado** en encolado, reclamo, reintento ni recuperación.

## Bug real encontrado y corregido

### [MEDIA] El fallo de WhatsApp inflaba el contador `failed` del resumen del ciclo
- **Reproducción:** en el escenario de WhatsApp fallido, antes del fix el resumen del ciclo reportaba `accepted=1` **y** `failed=1` para la misma cita (`eligible=1` pero `accepted+failed=2`). El correo sí quedaba correctamente `provider_accepted` (eso nunca estuvo mal), pero la métrica de "fallidos" del ciclo quedaba inflada porque la excepción de WhatsApp no se capturaba en su propio bloque y se propagaba hasta el `except` general por-cita de `process_appointment_reminders`, que SÍ incrementa `summary["failed"]`.
- **Impacto:** no hay pérdida de datos ni reintentos indebidos (la cita ya estaba marcada `reminder_sent=True` y no se vuelve a seleccionar), pero cualquier alerta/dashboard operativo basado en `summary["failed"]` del demonio de recordatorios sobre-reportaría fallos cada vez que WhatsApp falle en una cita cuyo correo sí se entregó — ruido que podría ocultar fallos reales de correo en medio del ruido de WhatsApp.
- **Corrección (mínima, `backend/appointment_reminder_delivery.py`):** se envolvió el bloque de envío de WhatsApp en su propio `try/except`, igual que ya está protegido a nivel de la confirmación pública en `server.py` (que sí tiene un `try/except` envolvente y por eso no sufría este problema). Un fallo de WhatsApp ahora solo imprime `reminder_whatsapp_failed` y no toca los contadores del ciclo.
- **Prueba:** `backend/tests/test_fase6_reminder_outbox_timeline.py::test_whatsapp_failure_never_marks_the_accepted_email_as_failed` ahora también afirma `summary["failed"] == 0`.
- **Nota:** se revisó el flujo equivalente de confirmación de cita en `server.py` (línea ~9179-9308) — ya tiene un `try/except` envolvente que evita que un fallo de WhatsApp rompa la respuesta de la API pública; no requirió cambio.

## Resumen de severidad
MEDIA: 1 (corregida, commit `3413f57`) · Resto: OK, sin duplicados ni pérdidas.

Siguiente fase: FASE 7 (preparación de migración fuera de Emergent).
