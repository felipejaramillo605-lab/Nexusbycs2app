# Hallazgos — Auditoría de paginación y rendimiento

## Alcance

- Pendiente de inventario estático de backend y frontend.
- Las conclusiones deben basarse en código, tests y configuraciones presentes; sin inventar métricas de producción.

## Hallazgos

### Inventario inicial

- Las pantallas activas principales de Clientes, Historial de citas, Ingresos, Liquidaciones, Owner auditoría/facturas/soporte y varias pantallas de inventario ya solicitan `page`/`page_size`; backend limita normalmente el tamaño a 100.
- `GET /appointments` y `GET /clients` mantienen compatibilidad heredada: si no reciben parámetros de paginación devuelven hasta 1.000 documentos. El frontend de Clientes usa la variante paginada, por lo que no es un cuello inmediato para esa pantalla; otros consumidores deben inventariarse antes de eliminar el fallback.
- Existen múltiples endpoints de inventario, analítica y operaciones que cargan hasta 100.000 documentos y agregan en memoria. Son candidatos de alto impacto, pero algunos son exportaciones, cálculos administrativos o flujos de aplicación de inventario y no deben paginarse sin separar una ruta de resumen/exportación.
- La paginación actual usa `skip` + `count_documents`; es correcta para páginas superficiales, pero degrada linealmente en páginas profundas si faltan índices compuestos compatibles con filtro y sort.

### Índices y corrección aplicada

- Clientes, citas y transacciones tienen índices compuestos que cubren sus listados paginados principales.
- Las líneas de auditoría de inventario se consultan filtrando por `audit_id` y ordenando por `item_name_snapshot`, pero solo tenían un índice único con el identificador técnico. Se añadió el índice aditivo `nexus_inventory_audit_lines_name` para evitar sort en memoria de auditorías grandes.
- La sintaxis de `backend/server.py` pasó `py_compile`. La prueba de comportamiento queda para CI/arranque que aplique el índice.

### Prioridades documentadas

- P1: catálogo de inventario con `to_list(100000)` y migración de SKU en lectura; resúmenes financieros en memoria; detalle/exportaciones de auditoría con grandes conjuntos.
- P2: audiencia de Marketing no paginada; `skip` en páginas profundas.
- P3: fallbacks heredados de 1.000 filas y búsqueda regex sin ancla.

## Errores de proceso

- La inicialización automática recibió un parámetro no compatible y creó plantillas vacías en la raíz. Se retiraron inmediatamente antes de iniciar la auditoría.
