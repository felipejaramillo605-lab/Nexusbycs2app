# FASE 5 — Salud de la base de datos (solo lectura)

**Rama:** `emergent/fase5-db-health`. **Alcance:** sin escrituras de negocio; las únicas escrituras realizadas fueron **borrar residuos de prueba** generados por esta misma auditoría (FASE 1 y FASE 4), nunca datos reales.

## Inventario de colecciones
101 colecciones en `test_database`. Las de mayor volumen de negocio: `appointments` (36), `users` (27), `user_sessions` (27), `clients` (25), `internal_reviews` (23), `security_events` (22), `barbers` (17), `services` (13). El resto son 0-10 documentos (entorno de desarrollo/Preview, no producción con tráfico real).

## Documentos sin `organization_id`
| Colección | Resultado |
|---|---|
| clients, appointments, barbers, services, transactions, class_sessions, class_bookings, inventory, message_templates, purchase_orders, suppliers | 0 — ninguna sin `organization_id`. |
| users | 3, todas esperadas o ya corregidas: 1 `owner` global (correcto, un owner puede no tener org asignada), 1 manager real pendiente de crear/asignar organización (`[correo omitido]`, flujo self-service normal, no se tocó), y 1 residuo `E2E_mgr_E2E_Standard_CO_*` dejado por el agente de pruebas en FASE 4 a pesar de su "cleanup_confirmation" — **se detectó y se borró** en esta fase. |

## Duplicados lógicos (mismo teléfono/correo dentro de la misma organización)
- **Sin duplicados reales de negocio.** Dos teléfonos aparecen en más de una organización (`+573103705753` en 3 orgs demo, `+573009998877` en 2) — es **comportamiento esperado** del modelo multi-tenant: un mismo número puede ser cliente de varias organizaciones distintas, no es el mismo tenant duplicando al cliente.
- **Hallazgo de limpieza (no de producto):** 3 clientes `client_test_*` con `email=loyalty_test@example.com` en `org_demo001`, creados por la propia corrida de `test_loyalty_and_calendar.py` en la FASE 1 de esta auditoría (timestamp de hoy) y no limpiados por el teardown del test porque la ejecución no llegó al `delete_one` final. **Se borraron.** Se recomienda revisar ese test para envolver el `delete` en un `try/finally` y evitar que una corrida fallida deje residuo en `org_demo001`.
- `test-org-123` (2 clientes, de julio, anterior a esta sesión) — artefacto de desarrollo antiguo, no creado en esta auditoría; se deja documentado, no se tocó (regla: no modificar datos que no se crearon en esta sesión salvo prefijo `E2E_`).

## Referencias huérfanas
| Relación | Huérfanos encontrados |
|---|---|
| `appointments.client_id` → `clients.client_id` | 0 / 36 |
| `appointments.service_id` → `services.service_id` | 0 / 36 |
| `appointments.barber_id` → `barbers.barber_id` | 0 / 36 |
| `class_bookings.class_session_id` → `class_sessions.class_session_id` | 0 / 9 |

## Consultas calientes — `explain()`

| Consulta | Plan ganador | Índice usado | Resultado |
|---|---|---|---|
| Agenda por fecha (`organization_id` + `date`) | `FETCH ← IXSCAN` | `nexus_org_date_time_appointment_desc` | OK |
| Citas elegibles para recordatorio (`organization_id` + `status` + rango de `date`) | `FETCH ← IXSCAN` | `nexus_org_status_date_time_appointment_desc` | OK |
| Outbox de correos por estado (`appointment_email_deliveries`, `organization_id` + `status`) | `FETCH ← IXSCAN` | `appointment_email_queue` | OK |
| **Cliente por teléfono dentro de una organización** (`clients`, usado en cada reserva pública para deduplicar/crear cliente — 4 sitios en `server.py`) | `FETCH ← IXSCAN` | `nexus_org_visits_client` (acota solo por `organization_id`; el filtro por `phone` se aplica en memoria sobre todos los clientes de esa organización) | **MEJORABLE** — sin impacto hoy (≤25 clientes por org), pero con miles de clientes por organización se vuelve un escaneo de toda la cartera de esa org en cada reserva. |

### Propuesta de índice (no ejecutada)
`ops/propuestas/indices_2026-08-11.py` — crea `clients` → `{organization_id:1, phone:1}` (`nexus_org_phone_client_lookup`, `background=True`, idempotente, no borra nada). **Pendiente de revisión de Felipe/Claude antes de ejecutarse.**

## Tabla de hallazgos

| # | Hallazgo | Severidad | Acción |
|---|---|---|---|
| 1 | Falta índice `{organization_id, phone}` en `clients` para la búsqueda por teléfono en cada reserva | MEDIA (no urgente al volumen actual, sí antes de escalar) | Script propuesto, sin ejecutar: `ops/propuestas/indices_2026-08-11.py` |
| 2 | Residuo de prueba `E2E_mgr_E2E_Standard_CO_*` que el agente de pruebas de FASE 4 reportó como limpio y no lo estaba | BAJA (ya corregido) | Borrado en esta fase. Recomendación: en próximas fases, verificar el cleanup del agente de pruebas con una consulta propia antes de confiar en su "cleanup_confirmation". |
| 3 | 3 clientes de prueba (`client_test_*`, `loyalty_test@example.com`) quedaron en `org_demo001` tras una corrida fallida de `test_loyalty_and_calendar.py` en FASE 1 | BAJA (ya corregido) | Borrados en esta fase. Sugerencia para una tarea futura (no se tocó código en esta fase de solo-lectura): envolver el teardown de ese test en `try/finally`. |
| 4 | 0 referencias huérfanas, 0 duplicados reales de negocio, 0 documentos sin `organization_id` en colecciones de negocio | OK | Ninguna acción. |

## Qué no se pudo verificar
- No se auditaron las 101 colecciones una por una con `explain()` individual (muchas tienen 0-1 documentos y no son "consultas calientes" reales en este volumen); se priorizaron las 4 consultas explícitamente pedidas por el usuario.
- No se evaluó el comportamiento a volumen real (eso es la FASE 8, fuera de esta corrida por instrucción explícita del usuario de detenerse tras FASE 5).

Siguiente paso: **DETENIDO según instrucción del usuario.** No se inician FASE 6, 7, 8 ni 9. Ver resumen ejecutivo en `/app/docs/emergent-reports/RESUMEN.md`.
