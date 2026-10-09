# Auditoría de paginación y cuellos de botella

Fecha: 2026-10-09  
Método: revisión estática de rutas, consumidores frontend e índices. No contiene métricas inventadas de producción; las prioridades indican riesgo al crecer los datos.

## Resumen ejecutivo

Las listas operativas de mayor uso ya tienen paginación con límites de 100: Clientes, historial de citas, ingresos, liquidaciones, facturas globales, auditoría de Owner, soporte y movimientos de inventario. Clientes y citas además tienen índices que coinciden con sus filtros/orden principales.

El riesgo principal no es una ausencia general de paginación, sino rutas administrativas, de inventario y analítica que cargan hasta 100.000 documentos en memoria. Algunas son exportaciones o cálculos completos y no deben convertirse ciegamente en páginas; requieren separar resumen, navegación y exportación.

## Prioridad

| Prioridad | Hallazgo | Evidencia | Riesgo al crecer | Solución | Esfuerzo |
|---|---|---|---|---|---|
| P1 | Catálogo de inventario sin paginación y migración de SKU en cada lectura | `GET /inventory/catalog/items` ejecuta `migrate()` y después `to_list(100000)`; ManagerInventory y ManagerServices lo consumen | Latencia/memoria y escrituras repetidas en cada carga; puede bloquear la interfaz de inventarios grandes | Separar migración en tarea única/versionada; añadir API paginada y búsqueda server-side; migrar consumidores | Medio/alto (2–4 días con UI y pruebas) |
| P1 | Resúmenes financieros cargan hasta 100.000 transacciones en Python | `/transactions/summary`, analítica y algunos reportes usan `to_list(100000)` y suman localmente | Memoria y CPU del worker; picos en organizaciones con histórico amplio | Sustituir por agregaciones Mongo (`$match` + `$group`) con proyecciones mínimas; conservar exportación en streaming | Medio (1–2 días por ruta) |
| P1 | Detalle/reporte de auditoría de inventario carga hasta 100.000 líneas | detalle, CSV/XLSX y reporte de auditoría consultan todas las líneas | Ordenamiento y serialización costosos; exportaciones grandes pueden agotar memoria | Navegación paginada; exportación con cursor/streaming; mantener reporte agregado | Medio (2–3 días) |
| P2 | Marketing carga clientes sin parámetros de página | `MarketingCampaigns.loadClients` usa `clientAPI.getAll` sin `page` | Devuelve hasta 1.000 y puede omitir audiencia real; carga más datos de los necesarios | Endpoint específico de audiencia consentida con cursor/página y búsqueda; selector con carga incremental | Medio (1–2 días) |
| P2 | Páginas profundas usan `skip` + `count_documents` | Patrón en Clientes, Citas, Transacciones, Liquidaciones y soporte | `skip` se degrada en páginas altas y cada navegación ejecuta conteo | Mantenerlo para UI administrativa superficial; introducir cursor/keyset donde haya historial largo y botón “cargar más” | Medio, incremental |
| P3 | Compatibilidad heredada de listas no paginadas | Clientes/Citas/Transacciones devuelven hasta 1.000 si no se envían parámetros | Consumidores antiguos pueden cargar respuestas grandes; eliminarlo sin inventario rompería contratos | Registrar/identificar consumidores y deprecar con aviso antes de volver obligatorios los parámetros | Bajo/medio |
| P3 | Búsqueda de clientes por regex sin ancla | búsqueda por nombre/teléfono/email con regex case-insensitive | No aprovecha bien el índice para coincidencias intermedias | Mantener límite de término; si hay volumen, normalizar campos de búsqueda o usar Atlas Search | Medio/alto |

## Corrección aplicada

Se añadió el índice `nexus_inventory_audit_lines_name` sobre:

```text
inventory_audit_lines: (audit_id ASC, item_name_snapshot ASC)
```

Es una mejora segura y aditiva: cubre las rutas que filtran por auditoría y ordenan por producto (detalle, CSV y hoja de conteo). Evita un ordenamiento en memoria para auditorías grandes. No cambia respuesta, permisos ni datos existentes. Se verificó sintaxis con `python -m py_compile backend/server.py`; la creación real del índice ocurrirá en el siguiente arranque autorizado de la aplicación.

## Índices ya correctos

- Clientes: `(organization_id, total_visits DESC, client_id)`.
- Citas: `(organization_id, date DESC, time DESC, appointment_id DESC)` y variante con `status`.
- Transacciones: combinaciones de organización, estado/filtros y fecha de creación.
- Movimientos y auditorías de inventario: índices de organización/fecha existentes.

## Plan de ejecución recomendado

1. **Primero:** medir con `explain("executionStats")` en una copia segura de datos, para cada P1, y registrar `nReturned`, `totalDocsExamined`, `totalKeysExamined` y duración. No ejecutar explain sobre tráfico crítico sin límite.
2. **Después:** convertir `transactions/summary` a agregación y añadir prueba de equivalencia frente al cálculo actual.
3. **Luego:** diseñar paginación de catálogo y líneas de auditoría, conservando exportación streaming y sin truncar resultados silenciosamente.
4. **Finalmente:** migrar Marketing a audiencia server-side paginada/cursor y deprecar las variantes heredadas de 1.000 filas.

## Nota para Claude

Claude: revisar el índice aditivo de `inventory_audit_lines` y, antes de fusionar/desplegar, validar que las consultas de detalle/exportación usan `audit_id` + `item_name_snapshot` como están escritas. El siguiente cambio de más valor es reemplazar las sumas de `/transactions/summary` por una agregación Mongo, con prueba de equivalencia; no paginar esa ruta porque es un resumen, no una lista.
